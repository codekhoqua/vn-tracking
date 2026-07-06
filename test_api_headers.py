import requests
from app import CHECKLIST_API_URL

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive'
}

res = requests.get(CHECKLIST_API_URL, headers=headers, allow_redirects=True)
print("Status:", res.status_code)
try:
    print("JSON length:", len(res.json()))
except Exception as e:
    print("Not JSON:", e)
    print("Response snippet:", res.text[:200])
