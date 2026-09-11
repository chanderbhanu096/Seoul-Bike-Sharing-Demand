"""Package complete observed input bundles; no imputation, prediction rules or retraining."""
from pathlib import Path
import csv,json,datetime
root=Path(__file__).resolve().parent.parent
with (root/'training/data/SeoulBikeData.csv').open(encoding='cp1252',newline='') as file:
 rows=list(csv.reader(file))[1:]
rows.sort(key=lambda r:(datetime.datetime.strptime(r[0],'%d/%m/%Y'),int(r[2])))
values=[[int(r[1]),*[float(r[i]) for i in range(3,11)],r[12]=='Holiday',r[13]=='Yes'] for r in rows]
assert len(values)==8760
for i,r in enumerate(rows):
 assert datetime.datetime.strptime(r[0],'%d/%m/%Y')+datetime.timedelta(hours=int(r[2]))==datetime.datetime(2017,12,1)+datetime.timedelta(hours=i)
(root/'data/history.json').write_text(json.dumps(values,separators=(',',':'))+'\n')
print('Packaged 8,760 complete hourly observations with contiguous timestamps.')
