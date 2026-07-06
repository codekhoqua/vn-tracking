import sys
import io
import urllib.request
import json
from app import CHECKLIST_API_URL

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("Fetching with urllib...")
req = urllib.request.Request(CHECKLIST_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = response.read().decode('utf-8')
        print("Data length:", len(data))
        try:
            js = json.loads(data)
            print("Is list?", isinstance(js, list))
            if isinstance(js, list):
                print("First item:", js[0] if len(js)>0 else "Empty")
        except Exception as e:
            print("Not JSON:", e)
            print(data[:200])
except Exception as e:
    print("Error:", e)
