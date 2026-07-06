import sys
import io
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app import load_checklist_data, CHECKLIST_API_URL

df_check = load_checklist_data(CHECKLIST_API_URL)

df_check['Trạng Thái'] = df_check['Trạng Thái'].astype(str).str.upper().isin(['TRUE', '1', 'T'])
df_check_latest = df_check.drop_duplicates(subset=['Tên Tác Phẩm', 'Checkbox ID'], keep='last')
check_counts = df_check_latest[df_check_latest['Trạng Thái'] == True].groupby('Tên Tác Phẩm')['Checkbox ID'].nunique().to_dict()

print("SOME KEYS IN CHECK_COUNTS:")
for k, v in list(check_counts.items())[:10]:
    print(f"'{k}': {v}")

print("---------------------------------")
print("CHECKING FOR 'おとりよせ王子':")
for k in check_counts.keys():
    if "おとりよせ王子" in str(k):
        print(f"FOUND: '{k}' -> {check_counts[k]}")
