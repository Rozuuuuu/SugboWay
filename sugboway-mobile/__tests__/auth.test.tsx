import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { Text } from "react-native";
import * as SecureStore from "expo-secure-store";
import AuthProvider, { useAuth } from "../components/AuthProvider";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const TOKEN_KEY = "sugboway-auth-token";
const USER_KEY = "sugboway-auth-user";

const okJson = (body: unknown) =>
  Promise.resolve({ status: 200, json: () => Promise.resolve(body) } as Response);

// Captures the live auth object on every render so tests can call and await
// `logout()` directly (its actual returned Promise), rather than firing a
// press event and hoping `act` flushes the right microtasks.
let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  const auth = useAuth();
  latestAuth = auth;
  const { isAuthed, isRestoring, user, login } = auth;
  return (
    <>
      <Text>{isRestoring ? "restoring" : "settled"}</Text>
      <Text>{isAuthed ? "in" : "out"}</Text>
      <Text>{user?.name ?? "no-user"}</Text>
      <Text onPress={() => login("ana@example.com", "hunter2")}>do-login</Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("starts signed out when SecureStore holds no token", async () => {
  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("out")).toBeTruthy());
});

it("settles isRestoring to false once the mount-time SecureStore check completes", async () => {
  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("settled")).toBeTruthy());
});

// Guards the mount-time restore path itself. Task 6 shipped with an equivalent
// read completely untested — deleting the read left every test green. Checked:
// commenting out the SecureStore.getItemAsync/setUser/setToken calls in the
// AuthProvider restore effect makes this test fail (isAuthed stays "out" and
// the name never appears), so this is not a test that would pass against a
// broken implementation.
it("restores a persisted session from SecureStore on mount", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
    if (key === TOKEN_KEY) return Promise.resolve("stored-token");
    if (key === USER_KEY) {
      return Promise.resolve(JSON.stringify({ name: "Ana Cruz", email: "ana@example.com", tier: "pro" }));
    }
    return Promise.resolve(null);
  });

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  await waitFor(() => expect(getByText("in")).toBeTruthy());
  expect(getByText("Ana Cruz")).toBeTruthy();
});

it("persists the token and user to SecureStore on successful login", async () => {
  jest.spyOn(global, "fetch").mockReturnValue(
    okJson({ token: "fresh-token", user: { name: "Ana Cruz", email: "ana@example.com", tier: "free" } })
  );

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("settled")).toBeTruthy());

  await act(async () => {
    fireEvent.press(getByText("do-login"));
  });

  await waitFor(() => expect(getByText("in")).toBeTruthy());
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, "fresh-token");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    USER_KEY,
    JSON.stringify({ name: "Ana Cruz", email: "ana@example.com", tier: "free" })
  );
});

// Backend behavior: login against an unverified account returns 403
// email_not_verified rather than a generic failure, and must not be treated
// as a session — nothing gets persisted and the user stays signed out.
it("does not persist anything when login reports an unverified email", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    { status: 403, json: () => Promise.resolve({ error: "email_not_verified" }) } as Response
  );

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("settled")).toBeTruthy());

  await act(async () => {
    fireEvent.press(getByText("do-login"));
  });

  expect(getByText("out")).toBeTruthy();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

it("clears SecureStore on logout and resolves the returned promise", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
    if (key === TOKEN_KEY) return Promise.resolve("stored-token");
    if (key === USER_KEY) {
      return Promise.resolve(JSON.stringify({ name: "Ana Cruz", email: "ana@example.com", tier: "free" }));
    }
    return Promise.resolve(null);
  });

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("in")).toBeTruthy());

  await act(async () => {
    await latestAuth!.logout();
  });

  expect(getByText("out")).toBeTruthy();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(USER_KEY);
});

// Guards the OOM-kill / force-stop / crash window from fix round 1: if the
// SecureStore deletes reject (Keystore unavailable, etc.), logout() must
// still resolve — not throw — and the user must still read as signed out.
// Checked: removing the try/catch around the Promise.all in AuthProvider's
// logout makes this test fail (the rejection propagates out of
// `latestAuth!.logout()`, so `await act(...)` throws and the test errors out
// instead of passing), so this is not a test that would pass against a
// broken implementation.
it("resolves (does not throw) and leaves the user signed out even when the SecureStore deletes reject", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
    if (key === TOKEN_KEY) return Promise.resolve("stored-token");
    if (key === USER_KEY) {
      return Promise.resolve(JSON.stringify({ name: "Ana Cruz", email: "ana@example.com", tier: "free" }));
    }
    return Promise.resolve(null);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error("keystore unavailable"));

  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("in")).toBeTruthy());

  let threw = false;
  try {
    await act(async () => {
      await latestAuth!.logout();
    });
  } catch {
    threw = true;
  }

  expect(threw).toBe(false);
  expect(getByText("out")).toBeTruthy();
});
