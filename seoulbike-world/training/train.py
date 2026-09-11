#!/usr/bin/env python3
"""Train SeoulBike World v1 from public UCI 560 with an immutable final temporal holdout.
Run: python train.py. Dependencies in requirements.txt. No heldout value tunes the model.
"""
from __future__ import annotations
import hashlib,json,math,platform,sys,subprocess,socket
from pathlib import Path
from datetime import datetime,timezone
from zipfile import ZipFile
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error,mean_squared_error
from sklearn.neighbors import NearestNeighbors

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
SOURCE='https://archive.ics.uci.edu/static/public/560/seoul%2Bbike%2Bsharing%2Bdemand.zip'
DATA=ROOT/'data'/'SeoulBikeData.csv'
if not DATA.exists():
    ROOT.joinpath('data').mkdir(exist_ok=True)
    subprocess.run(['curl','-L','--fail',SOURCE,'-o',str(ROOT/'source.zip')],check=True)
    with ZipFile(ROOT/'source.zip') as z:
        DATA.write_bytes(z.read('SeoulBikeData.csv'))

NUMERIC=['temperature','humidity','windSpeed','visibility','dewPoint','solarRadiation','rainfall','snowfall']
FEATURES=['hour',*NUMERIC,'holiday','weekend','hourSin','hourCos','dayOfYearSin','dayOfYearCos',*[f'weekday{i}' for i in range(7)],*[f'season{s}' for s in ['Winter','Spring','Summer','Autumn']],*[f'hour{i}' for i in range(24)]]
SEASONS=['Winter','Spring','Summer','Autumn']

def write(name,obj):
    (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')

def scenario(row):
    return {'date':row['date'].strftime('%Y-%m-%d'),'hour':int(row['hour']),**{k:float(row[k]) for k in NUMERIC},'season':row['season'],'holiday':bool(row['holiday']),'functioning':bool(row['functioning'])}

def features(s):
    d=datetime.strptime(s['date'],'%Y-%m-%d');dow=d.weekday();doy=d.timetuple().tm_yday
    return [s['hour'],*[s[k] for k in NUMERIC],int(s['holiday']),int(dow>=5),math.sin(s['hour']*2*math.pi/24),math.cos(s['hour']*2*math.pi/24),math.sin((doy-1)*2*math.pi/365.25),math.cos((doy-1)*2*math.pi/365.25),*[int(dow==i) for i in range(7)],*[int(s['season']==v) for v in SEASONS],*[int(s['hour']==i) for i in range(24)]]

def metrics(y,p):
    return {'n':len(y),'mae':float(mean_absolute_error(y,p)),'rmse':float(np.sqrt(mean_squared_error(y,p)))}

class CalendarBaseline:
    """Mean recorded operating rentals by hour×weekend×season; fallback hour×weekend, then mean."""
    def fit(self,df):
        active=df[df.functioning]
        self.specific=active.groupby(['hour','weekend','season']).y.mean().to_dict()
        self.hour_weekend=active.groupby(['hour','weekend']).y.mean().to_dict()
        self.mean=float(active.y.mean());return self
    def predict(self,df):
        return np.array([self.specific.get((r.hour,r.weekend,r.season),self.hour_weekend.get((r.hour,r.weekend),self.mean)) if r.functioning else 0 for r in df.itertuples()])

df=pd.read_csv(DATA,encoding='latin1').rename(columns={'Date':'date','Rented Bike Count':'y','Hour':'hour','Temperature(°C)':'temperature','Humidity(%)':'humidity','Wind speed (m/s)':'windSpeed','Visibility (10m)':'visibility','Dew point temperature(°C)':'dewPoint','Solar Radiation (MJ/m2)':'solarRadiation','Rainfall(mm)':'rainfall','Snowfall (cm)':'snowfall','Seasons':'season','Holiday':'holiday','Functioning Day':'functioning'})
df.date=pd.to_datetime(df.date,format='%d/%m/%Y');df.holiday=df.holiday.eq('Holiday');df.functioning=df.functioning.eq('Yes')
df['timestamp']=df.date+pd.to_timedelta(df.hour,unit='h');df=df.sort_values('timestamp').reset_index(drop=True)
df['weekend']=df.date.dt.weekday>=5
assert len(df)==8760 and not df.isna().any().any()
assert df.timestamp.is_unique and (df.timestamp.diff().iloc[1:]==pd.Timedelta(hours=1)).all()
assert (df.loc[~df.functioning,'y']==0).all()
assert set(df.season)==set(SEASONS)
assert len(FEATURES)==len(features(scenario(df.iloc[0])))
X=np.asarray([features(scenario(r)) for _,r in df.iterrows()],dtype=np.float64);y=df.y.to_numpy(dtype=float)
# Train 60%, validation 20%, final test 20%, chronologically ordered without shuffle.
cut1=5256;cut2=7008
tr=np.arange(0,cut1);va=np.arange(cut1,cut2);te=np.arange(cut2,len(df));tv=np.arange(cut2)
active=df.functioning.to_numpy();tr_active=tr[active[tr]];tv_active=tv[active[tv]]
CANDIDATES={
 'calendar_baseline':lambda:CalendarBaseline(),
 'ridge_alpha100':lambda:make_pipeline(StandardScaler(),Ridge(alpha=100)),
 'gradient_boosting_depth3':lambda:GradientBoostingRegressor(n_estimators=450,learning_rate=0.05,max_depth=3,min_samples_leaf=12,random_state=20260911,loss='squared_error'),
 'gradient_boosting_depth4':lambda:GradientBoostingRegressor(n_estimators=450,learning_rate=0.05,max_depth=4,min_samples_leaf=12,random_state=20260911,loss='squared_error'),
}
validation={}
for name,make in CANDIDATES.items():
    m=make()
    if name=='calendar_baseline':m.fit(df.iloc[tr]);p=m.predict(df.iloc[va])
    else:m.fit(X[tr_active],y[tr_active]);p=np.where(active[va],np.maximum(0,m.predict(X[va])),0)
    validation[name]=metrics(y[va],p);print(name,validation[name],flush=True)
selected=min(validation,key=lambda n:validation[n]['mae'])
print('Selected by validation MAE:',selected,flush=True)
# Only now fit final versions to earlier 80%. Final test is assessed once per fixed candidate.
final_metrics={};final_predictions={};selected_model=None
for name,make in CANDIDATES.items():
    m=make()
    if name=='calendar_baseline':m.fit(df.iloc[tv]);p=m.predict(df.iloc[te])
    else:m.fit(X[tv_active],y[tv_active]);p=np.where(active[te],np.maximum(0,m.predict(X[te])),0)
    final_metrics[name]=metrics(y[te],p);final_predictions[name]=p
    if name==selected:selected_model=m
print('Final holdout:',final_metrics,flush=True)
assert selected.startswith('gradient_boosting'), 'Selected family changed: implement corresponding export rather than silently choosing a tree.'
m=selected_model
artifact={
 'format':'sklearn-gradient-boosting-v1','version':'seoulbike-uci560-gbr-v1','features':FEATURES,
 'initialPrediction':float(m.init_.constant_[0,0]),'learningRate':float(m.learning_rate),
 'inputPrecision':'float32 (Math.fround each expanded feature before tree comparisons)',
 'predictionRule':'When functioning=false return 0 by explicit service availability rule. Otherwise max(0, initialPrediction + learningRate * sum(tree leaf values)). Do not round until display.',
 'trees':[]
}
for estimator in m.estimators_.ravel():
    t=estimator.tree_
    artifact['trees'].append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'value':t.value[:,0,0].tolist()})

def exported_predict(s):
    if not s['functioning']:return 0.0
    x=np.asarray(features(s),dtype=np.float32);pred=artifact['initialPrediction']
    for tree in artifact['trees']:
        i=0
        while tree['left'][i]!=-1:
            i=tree['left'][i] if float(x[tree['feature'][i]])<=tree['threshold'][i] else tree['right'][i]
        pred+=artifact['learningRate']*tree['value'][i]
    return max(0.0,pred)
all_preds=np.where(active,np.maximum(0,m.predict(X)),0)
# Every CSV row must match the serialized numeric tree traversal, not just chosen presets.
max_err=max(abs(exported_predict(scenario(row))-all_preds[i]) for i,row in df.iterrows())
assert max_err<1e-9,max_err
write('model.json',artifact)

# Empirical scenario support, fit exclusively on final training observations.
# Distances include weather and hour; they are a heuristic, not predictive uncertainty.
SUPPORT_FEATURES=[*NUMERIC,'hourSin','hourCos','holiday','weekend']
indices=[FEATURES.index(f) for f in SUPPORT_FEATURES]
raw=X[tv_active][:,indices];center=np.mean(raw,axis=0);scale=np.std(raw,axis=0);scale[scale<1e-9]=1
z=(raw-center)/scale
nearest=NearestNeighbors(n_neighbors=2).fit(z);dist,_=nearest.kneighbors(z)
threshold=float(np.quantile(dist[:,1],0.99))
support={
 'method':'Nearest operating training observation in standardized weather, cyclic hour, holiday and weekend features. Threshold is training leave-one-out nearest-distance 99th percentile. Heuristic support warning; not uncertainty or causality.',
 'features':SUPPORT_FEATURES,'center':center.tolist(),'scale':scale.tolist(),'threshold':threshold,
 'referenceVectors':np.round(raw,8).tolist(),
 'ranges':{k:{'min':float(df.iloc[tv_active][k].min()),'max':float(df.iloc[tv_active][k].max()),'p01':float(df.iloc[tv_active][k].quantile(.01)),'p99':float(df.iloc[tv_active][k].quantile(.99))} for k in ['hour',*NUMERIC]},
 'trainingDateStart':df.iloc[0].date.strftime('%Y-%m-%d'),'trainingDateEnd':df.iloc[cut2-1].date.strftime('%Y-%m-%d'),
 'trainingRows':len(tv_active)
}
write('support.json',support)

# Presets are observed coherent full input vectors, selected by declared criteria, never made-up weather.
def preset(id,label,description,index):
    row=df.loc[index];s=scenario(row)
    return {'id':id,'label':label,'description':description,'scenario':s,'observed':int(row.y),'prediction':exported_predict(s),'sourceRow':int(index)+2,'partition':'final holdout' if index>=cut2 else ('validation reused for final training' if index>=cut1 else 'training'),'modelVersion':artifact['version']}
# Restrict presets to pre-holdout observations: none is selected because of final error.
pool=df.iloc[:cut2]
choices=[
 ('autumn','Autumn afternoon','Clear, dry afternoon · complete historical observation',pool[(pool.season=='Autumn')&(pool.hour==15)&(pool.temperature.between(20,28))&(pool.humidity.between(35,65))&(pool.solarRadiation>1.4)&(pool.rainfall==0)&(pool.functioning)].index[0]),
 ('rain','Rainy afternoon','Rain and related weather move together · complete historical observation',pool[(pool.hour==15)&(pool.rainfall>=3)&(pool.temperature>10)&(pool.functioning)].index[0]),
 ('snow','Winter snow','Cold air and snow · complete historical observation',pool[(pool.hour==15)&(pool.snowfall>=1)&(pool.temperature<1)&(pool.functioning)].index[0]),
 ('commute','Evening commute','Weekday at 18:00 · complete historical observation',pool[(pool.season=='Autumn')&(pool.hour==18)&(~pool.weekend)&(pool.rainfall==0)&(pool.functioning)].index[0]),
 ('night','Quiet night','At 03:00 · complete historical observation',pool[(pool.season=='Autumn')&(pool.hour==3)&(pool.rainfall==0)&(pool.functioning)].index[0])
]
presets=[preset(*choice) for choice in choices];write('presets.json',presets)
# Earliest full final-heldout day with 24 operating hours, selected on availability only.
play_start=next(int(group.index[0]) for _,group in df.iloc[cut2:].groupby('date',sort=True) if len(group)==24 and group.functioning.all() and group.hour.tolist()==list(range(24)))
playback=[{'scenario':scenario(df.iloc[i]),'observed':int(y[i]),'prediction':float(all_preds[i]),'partition':'final holdout','sourceRow':i+2,'modelVersion':artifact['version']} for i in range(play_start,play_start+24)]
write('playback.json',{'label':f'Untouched final holdout · {df.iloc[play_start].date.strftime("%d %B %Y")}','selection':'Earliest full final-heldout day with all 24 hours operating; chosen by availability and completeness only, never outcomes or prediction errors.','rows':playback})
fixture_idx=[0,12,100,1000,5255,5256,7007,7008,8000,8759,*[int(c[-1]) for c in choices],*df.index[~df.functioning].tolist()[:1]]
fixtures=[{'scenario':scenario(df.iloc[i]),'expected':float(all_preds[i]),'sourceRow':i+2} for i in fixture_idx]
# Perturbed single factor fixtures exercise non-historical inputs without labelling them data.
for rain in [0.0,1.0,5.0,12.0,25.0]:
    s={**presets[0]['scenario'],'rainfall':rain};fixtures.append({'scenario':s,'expected':exported_predict(s),'label':'single-factor rainfall verification'})
write('fixtures.json',{'tolerance':1e-8,'modelVersion':artifact['version'],'fixtures':fixtures,'all8760RowsMaxAbsoluteExportError':max_err})

# Weather/hour/operating slices are descriptive audits, not model selection.
p=final_predictions[selected];test=df.iloc[te];slices={}
for name,mask in {
 'dry':test.rainfall.eq(0),'rain':test.rainfall.gt(0),'snow':test.snowfall.gt(0),
 'freezing':test.temperature.le(0),'operating':test.functioning,'closed':~test.functioning,
 'night_00_05':test.hour.lt(6),'morning_peak_07_09':test.hour.between(7,9),
 'day_10_16':test.hour.between(10,16),'evening_peak_17_19':test.hour.between(17,19),
 'late_20_23':test.hour.between(20,23),
}.items():
    mask=mask.to_numpy();slices[name]=metrics(y[te][mask],p[mask]) if mask.any() else {'n':0,'mae':None,'rmse':None}

def period(ids):
    a,b=df.iloc[ids[0]],df.iloc[ids[-1]]
    return {'rows':len(ids),'operatingRows':int(active[ids].sum()),'start':a.timestamp.isoformat(),'end':b.timestamp.isoformat(),'timezone':'Asia/Seoul (local clock; no zone stored by source)'}
sha=hashlib.sha256(DATA.read_bytes()).hexdigest()
meta={
 'title':'Seoul Bike Sharing Demand','repository':'UCI Machine Learning Repository','datasetId':560,
 'sourceUrl':'https://archive.ics.uci.edu/dataset/560/seoul+bike+sharing+demand','downloadUrl':SOURCE,
 'doi':'https://doi.org/10.24432/C5F62R','license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/',
 'attribution':'Seoul Bike Sharing Demand [Dataset]. (2020). UCI Machine Learning Repository. https://doi.org/10.24432/C5F62R.',
 'retrievedAtUtc':datetime.fromtimestamp((ROOT/'source.zip').stat().st_mtime if (ROOT/'source.zip').exists() else DATA.stat().st_mtime,timezone.utc).isoformat(),'file':'SeoulBikeData.csv','sha256':sha,'rows':len(df),
 'timestampStart':df.timestamp.iloc[0].isoformat(),'timestampEnd':df.timestamp.iloc[-1].isoformat(),
 'modifications':'Parsed day-first dates; renamed columns; encoded calendar features; sorted chronologically; no rows imputed or discarded from evaluation. Fitted predictors only on operating training rows. Trained and exported regression model; selected historical subsets for presets and playback.',
 'units':{'temperature':'°C','humidity':'%','windSpeed':'m/s','visibility':'10 m','dewPoint':'°C','solarRadiation':'MJ/m²','rainfall':'mm','snowfall':'cm','target':'recorded rentals/hour'}
}
write('metadata.json',meta)
evaluation={
 'modelVersion':artifact['version'],'selected':selected,'selectionMetric':'validation MAE','target':'Recorded citywide bike rentals in an hour, not concurrent riders or unmet demand',
 'split':{'train':period(tr),'validation':period(va),'finalTest':period(te),'finalFit':period(tv)},
 'validation':validation,'finalTest':final_metrics,'selectedFinalTestSlices':slices,
 'candidateParameters':{'calendar_baseline':'hour × weekend × season mean; fall back to hour × weekend then global mean; active training hours only','ridge_alpha100':'StandardScaler fitted on active training only, Ridge(alpha=100)','gradient_boosting_depth3':CANDIDATES['gradient_boosting_depth3']().get_params(),'gradient_boosting_depth4':CANDIDATES['gradient_boosting_depth4']().get_params()},
 'exportParity':{'rows':len(df),'maxAbsoluteError':max_err,'tolerance':1e-9},
 'support':{'referenceRows':len(tv_active),'distanceThreshold99pct':threshold},
 'runtime':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'scikitLearn':sklearn.__version__},
 'limitations':[
 'Only one year (December 2017–November 2018); contemporary transport habits and operations may differ.',
 'Strict temporal splits expose seasonal distribution shift; final test is autumn whereas most training is winter, spring and summer.',
 'No station, route, trip duration or neighborhood information. All animated spatial allocation is illustrative.',
 'Rain, snow and operating-state slices can be small; see their sample counts.',
 'Conditional prediction and ordered local explanations are associative and do not identify causal weather effects.',
 'The support check measures similarity to operating training observations; it is not calibrated predictive uncertainty.',
 'No prediction interval is displayed because no interval model and heldout coverage evaluation were performed.',
 'Candidate family was selected on validation MAE only. Final test scores did not feed model or preset selection.'
 ]
}
write('evaluation.json',evaluation)
print(json.dumps({'selected':selected,'validation':validation[selected],'final':final_metrics[selected],'presets':presets,'export_error':max_err,'assets':{p.name:p.stat().st_size for p in OUT.iterdir()}},indent=2),flush=True)
