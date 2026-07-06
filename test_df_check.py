import sys
import io
import pandas as pd
from app import load_checklist_data, CHECKLIST_API_URL

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

df_check = load_checklist_data(CHECKLIST_API_URL)
print("Total rows loaded:", len(df_check))
if len(df_check) > 0:
    print("Columns:", df_check.columns.tolist())
    print("First 2 rows:", df_check.head(2).to_dict('records'))

df_check['Trạng Thái'] = df_check['Trạng Thái'].astype(str).str.upper().isin(['TRUE', '1', 'T'])
print("Rows with Trạng Thái == True:", len(df_check[df_check['Trạng Thái'] == True]))
