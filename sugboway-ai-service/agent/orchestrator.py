from langchain.agents import create_openai_tools_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from .prompt import get_chat_prompt
from .tools import get_route_options, calculate_fare, check_congestion
import os

def setup_agent():
    # Initialize the LLM
    # In a real setup, make sure OPENAI_API_KEY is in the environment
    llm = ChatOpenAI(temperature=0, model="gpt-4-turbo-preview")

    # Define the tools available to the agent
    tools = [get_route_options, calculate_fare, check_congestion]

    # Get the system prompt
    prompt = get_chat_prompt()

    # Create the agent
    agent = create_openai_tools_agent(llm, tools, prompt)

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
