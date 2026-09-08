import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Routes" }} />
      <Tabs.Screen name="traffic" options={{ title: "Traffic" }} />
      <Tabs.Screen name="chat" options={{ title: "Ask SugboWay" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
