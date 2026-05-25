try:
    from langchain_classic.agents import create_tool_calling_agent, AgentExecutor
except ImportError:
    from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_google_genai import ChatGoogleGenerativeAI
from .prompt import get_chat_prompt
from .tools import get_route_options, calculate_fare, check_congestion, verify_stop
import os

def setup_agent():
    # Map GEMINI_API_KEY to GOOGLE_API_KEY for langchain-google-genai
    if "GEMINI_API_KEY" in os.environ and "GOOGLE_API_KEY" not in os.environ:
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
        
    # Initialize the LLM with Gemini
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

    # Define the tools available to the agent
    tools = [get_route_options, calculate_fare, check_congestion, verify_stop]

    # Get the system prompt
    prompt = get_chat_prompt()

    # Create the agent
    agent = create_tool_calling_agent(llm, tools, prompt)

    # Create the executor
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=3)

    return agent_executor

def process_message(message: str) -> str:
    """
    Main entry point for processing a user's chat message.
    """
    agent_executor = setup_agent()
    
    try:
        response = agent_executor.invoke({"input": message})
        output = response.get("output", "I encountered an error processing your request.")
        
        if isinstance(output, list):
            text_parts = []
            for block in output:
                if isinstance(block, dict) and "text" in block:
                    text_parts.append(block["text"])
                elif hasattr(block, "text"):
                    text_parts.append(getattr(block, "text"))
                else:
                    text_parts.append(str(block))
            output = "".join(text_parts)
        elif not isinstance(output, str):
            output = str(output)
            
        return output
    except Exception as e:
        return f"Error: {str(e)}"
