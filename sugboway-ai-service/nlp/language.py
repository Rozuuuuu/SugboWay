import re

# Simple heuristic dictionary for initial language detection
CEBUANO_KEYWORDS = {"plete", "sakay", "lugsong", "asa", "padulong", "lugar", "lang", "pila", "unsaon"}
TAGALOG_KEYWORDS = {"magkano", "saan", "papunta", "sakay", "baba", "bayad"}

def detect_language(text: str) -> str:
    """
    Detects if the user is speaking Cebuano, Tagalog, or English.
    For Phase 3, this is a lightweight heuristic approach. 
    Can be swapped with fastText model later if needed.
    """
    words = set(re.findall(r'\b\w+\b', text.lower()))
    
    cebuano_count = len(words.intersection(CEBUANO_KEYWORDS))
    tagalog_count = len(words.intersection(TAGALOG_KEYWORDS))
    
    if cebuano_count > tagalog_count:
        return "cebuano"
    elif tagalog_count > cebuano_count:
        return "tagalog"
    else:
        return "english"

def extract_lexicon(text: str) -> dict:
    """
    Identifies specific lexicon intents in the text.
    """
    intents = {
        "needs_fare_info": bool(re.search(r'\b(plete|pila plete|magkano|fare)\b', text.lower())),
        "needs_disembark_info": bool(re.search(r'\b(lugsong|baba|get off|lugar lang)\b', text.lower())),
        "needs_ride_info": bool(re.search(r'\b(sakay|ride|get on)\b', text.lower()))
    }
    return intents
