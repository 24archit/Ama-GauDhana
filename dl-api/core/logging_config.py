import logging
import sys

def setup_logging():
    # Setup structured logging
    logger = logging.getLogger("dl_api")
    logger.setLevel(logging.DEBUG)
    
    # Avoid duplicate logs if already configured
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger

logger = setup_logging()
