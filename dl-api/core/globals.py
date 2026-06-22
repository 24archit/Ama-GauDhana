import threading
import asyncio

# Global state variables populated during application startup
dl = None       # DLPipeline — access CLIP via dl.clip_analyzer
db = None       # CattleVectorStore
xgb_model = None

# Thread lock to prevent concurrent GPU/Model inferences across threads
gpu_lock = threading.Lock()

# asyncio primitives to be initialized in the event loop (main.py lifespan)
gpu_semaphore = None
in_flight_registrations = set()
db_registration_lock = None

