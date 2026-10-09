"""learn-and-automate deterministic layer (zero-LLM).

Every function takes `source_key` explicitly (e.g. "x:sureshkbn") — there is no
global "active source", so two sources can be learned concurrently.
"""
