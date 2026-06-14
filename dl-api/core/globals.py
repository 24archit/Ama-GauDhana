import threading

# Global state variables populated during application startup
dl = None
db = None
xgb_model = None

# Thread lock to prevent concurrent GPU/Model inferences
gpu_lock = threading.Lock()

# Registry for active background jobs
active_jobs = {}
