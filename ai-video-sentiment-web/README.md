Testing new readme
export $(cat .env | xargs) && uvicorn server:app --host 0.0.0.0 --port 8000
