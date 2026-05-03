Whenever we want to reinstall dependencies (run from `deployment/`):

./venv/bin/pip install -r requirements.lock

set -a; source .env; set +a; uvicorn server:app --host 0.0.0.0 --port 8000
