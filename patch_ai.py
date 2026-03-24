import os
with open('backend/services/ai_analyst.py', 'r') as f:
    text = f.read()

new_logic = """
        if query:
            prompt = f"You are a football tactician. Recent match events:\\n{events_text}\\n\\nThe user asks: '{query}'\\n\\nAnswer analytically in 100 words. Focus strictly on football."
        else:
            prompt = f"You are a football tactical analyst. Last sequence:\\n{events_text}\\n\\nProvide a short, punchy 50-word insight."
"""

text = text.replace('prompt = f"""You are a professional football tactical', new_logic + '\n        # prompt = f"""You are a professional football tactical')

text = text.replace('if not events:\n            return', 'if not events and not query:\n            return')

with open('backend/services/ai_analyst.py', 'w') as f:
    f.write(text)
