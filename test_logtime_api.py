import requests
from app import LOGTIME_API_URL

res = requests.get(LOGTIME_API_URL)
print("LOGTIME Status:", res.status_code)
try:
    print("LOGTIME JSON:", res.json())
except Exception as e:
    print("Not JSON")
