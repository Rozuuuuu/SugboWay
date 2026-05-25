from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_google_genai import ChatGoogleGenerativeAI
from .prompt import get_chat_prompt
from .tools import get_route_options, calculate_fare, check_congestion
import os

def setup_agent():
    # Initialize the LLM with Gemini
    llm = ChatGoogleGenerativeAI(temperature=0, model="gemini-1.5-pro-latest")

    # Define the tools available to the agent
    tools = [get_route_options, calculate_fare, check_congestion]

    # Get the system prompt
    prompt = get_chat_prompt()

    # Create the agent
    agent = create_tool_calling_agent(llm, tools, prompt)

    # Create the executor
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    return agent_executor

def process_message(message: str) -> str:
    """
    Main entry point for processing a user's chat message.
    """
    agent_executor = setup_agent()
    
    try:
        response = agent_executor.invoke({"input": message})
        return response.get("output", "I encountered an error processing your request.")
    except Exception as e:
        return f"Error: {str(e)}"
