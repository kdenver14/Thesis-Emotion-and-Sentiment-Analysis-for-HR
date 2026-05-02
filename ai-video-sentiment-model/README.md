Whenever we want to reinstall dependecies

./venv/bin/pip install -r requirements.lock

export $(cat .env | xargs) && uvicorn server:app --host 0.0.0.0 --port 8000
