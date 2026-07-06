import pandas as pd
from app import csv_url
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

df_raw = pd.read_csv(csv_url, usecols=list(range(1, 16)), header=None)
idx_tuan = df_raw[df_raw.apply(lambda row: row.astype(str).str.contains('Tuần làm việc', case=False, na=False).any(), axis=1)].index

if len(idx_tuan) > 1:
    start_idx = idx_tuan[1]
    print(f"Index TUAN SAU: {start_idx}")
    for i in range(start_idx, min(start_idx + 5, len(df_raw))):
        row_vals = df_raw.iloc[i].dropna().astype(str).str.strip().tolist()
        print(f"Row {i}: {row_vals}")
        
        # Test logic
        dates = []
        for v in row_vals:
            v_str = str(v).strip()
            if v_str in ['nan', 'NaN', 'None', ''] or v_str in [':', '->', '-', '=>']:
                continue
            if 'tuần' not in v_str.lower() and not any(kw in v_str.lower() for kw in ['deadline', 'deadlien', 'hạn chót']) and not v_str.isnumeric() and len(v_str) >= 5:
                dates.append(v_str)
                
        print(f"  -> dates: {dates}")
        if any(kw in str(v).lower() for v in row_vals for kw in ['deadline', 'deadlien', 'hạn chót']) and len(dates) >= 1:
            print(f"  -> MATCHED DEADLINE: {dates[-1]}")
else:
    print("Not enough Tuan lam viec found")
