import pandas as pd
import requests
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CHECKLIST_API_URL = "https://script.google.com/macros/s/AKfycbyguXQno1gohakWqgfTwd0uP-b9BNkkExBcXIe23O267Jr2cXBX2JDSuS0_EVu_uv-7/exec"

res = requests.get(CHECKLIST_API_URL)
data = res.json()
df_check = pd.DataFrame(data)

df_check['Trạng Thái'] = df_check['Trạng Thái'].astype(str).str.upper().isin(['TRUE', '1', 'T'])
df_check_latest = df_check.drop_duplicates(subset=['Tên Tác Phẩm', 'Checkbox ID'], keep='last')
check_counts = df_check_latest[df_check_latest['Trạng Thái'] == True].groupby('Tên Tác Phẩm')['Checkbox ID'].nunique().to_dict()

print("SOME KEYS IN CHECK_COUNTS:")
for k, v in list(check_counts.items())[:10]:
    print(f"'{k}': {v}")

print("---------------------------------")
print("CHECKING FOR 'おとりよせ王子 飯田好実':")
for k in check_counts.keys():
    if "飯田好実" in str(k):
        print(f"FOUND: '{k}' -> {check_counts[k]}")
