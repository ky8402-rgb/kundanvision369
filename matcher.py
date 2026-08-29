import logging
import numpy as np
from sentence_transformers import SentenceTransformer
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lazy load model to save memory if not used
_model = None

def load_model():
    global _model
    if _model is None:
        logger.info("Loading AI model (all-MiniLM-L6-v2)... This may take a moment.")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Model loaded successfully.")
    return _model

# Our 4 service descriptions for embeddings
PACKAGES = {
    "fullstack": "Build full stack web applications using React, TypeScript, Node.js, and deploy to cloud platforms like AWS or Render.",
    "ai_agent": "Develop AI agents and automation workflows using Gemini LLM, webhooks, HMAC security, and integration with third-party APIs.",
    "payment_gateway": "Integrate payment systems including PayPal, Stripe, and Indian UPI QR codes for e-commerce and fintech platforms.",
    "code_audit": "Perform rapid code auditing, bug fixing, performance optimization, and security hardening for existing codebases."
}

# Keyword fallback scoring (if embedding fails)
KEYWORD_SCORES = {
    "fullstack": ["react", "node", "typescript", "full stack", "frontend", "backend", "cloud", "deploy"],
    "ai_agent": ["ai", "llm", "gemini", "automation", "webhook", "api", "agent", "workflow"],
    "payment_gateway": ["paypal", "stripe", "upi", "payment", "gateway", "fintech", "transaction", "wallet"],
    "code_audit": ["bug", "fix", "error", "performance", "audit", "security", "optimize", "debug"]
}

def get_package_embeddings():
    """Get pre-computed embeddings for the 4 packages."""
    model = load_model()
    descriptions = list(PACKAGES.values())
    embeddings = model.encode(descriptions)
    return {pkg: emb for pkg, emb in zip(PACKAGES.keys(), embeddings)}

def keyword_fallback(description):
    """Simple keyword scoring if AI model fails to load."""
    scores = {pkg: 0 for pkg in PACKAGES.keys()}
    desc_lower = description.lower()
    for pkg, keywords in KEYWORD_SCORES.items():
        for kw in keywords:
            if kw in desc_lower:
                scores[pkg] += 10
    return max(scores, key=scores.get), max(scores.values())

def match_job(job_data):
    """
    Match a single job to one of our 4 packages.
    Returns: (matched_package, similarity_score)
    """
    description = job_data.get('description', '')
    title = job_data.get('title', '')
    
    # Combine title and description for better context
    full_text = f"{title} {description}"
    
    try:
        # 1. Try AI Embeddings
        model = load_model()
        package_embs = get_package_embeddings()
        job_emb = model.encode([full_text])[0]
        
        best_pkg = None
        best_score = -1
        
        for pkg, pkg_emb in package_embs.items():
            # Cosine similarity
            sim = np.dot(job_emb, pkg_emb) / (np.linalg.norm(job_emb) * np.linalg.norm(pkg_emb))
            if sim > best_score:
                best_score = sim
                best_pkg = pkg
        
        # Map package key to display name
        pkg_display = {
            "fullstack": "Full-Stack Engineering ($499)",
            "ai_agent": "AI Agent & Webhook ($299)",
            "payment_gateway": "Payment Gateway Integration ($199)",
            "code_audit": "Code Audit & Fixes ($99)"
        }
        
        threshold = float(os.getenv('SIMILARITY_THRESHOLD', 0.65))
        if best_score >= threshold:
            return pkg_display[best_pkg], best_score
        else:
            return None, best_score
            
    except Exception as e:
        logger.error(f"AI Matching failed, falling back to keywords: {e}")
        # 2. Fallback to Keyword scoring
        pkg_key, score = keyword_fallback(full_text)
        if score > 20:  # At least 2 keywords match
            pkg_display = {
                "fullstack": "Full-Stack Engineering ($499)",
                "ai_agent": "AI Agent & Webhook ($299)",
                "payment_gateway": "Payment Gateway Integration ($199)",
                "code_audit": "Code Audit & Fixes ($99)"
            }
            return pkg_display[pkg_key], float(score / 100)  # Normalize roughly
        return None, 0.0
