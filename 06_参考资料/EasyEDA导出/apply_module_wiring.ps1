param([Parameter(Mandatory=$true)][string]$Module,[string]$PlanName=$Module)
$base = 'C:\Users\limer\Desktop\motor-driver'
$exportDir = Join-Path $base '06_参考资料\EasyEDA导出'
$planPath = Join-Path $exportDir ("easyeda_module_wiring_{0}.json" -f $PlanName)
python (Join-Path $exportDir 'easyeda_local_router.py') $Module | Set-Content -LiteralPath $planPath -Encoding utf8
$plan = Get-Content -Raw $planPath | ConvertFrom-Json
$wireSpecs = @($plan.wires) | ForEach-Object { @{net=$_.net;paths=$_.paths} }
$portSpecs = @($plan.ports) | ForEach-Object { @{net=$_.name;x=[double]$_.points[0].x;y=[double]$_.points[0].y;rot=[int]$_.points[0].rot} }
$wj = $wireSpecs | ConvertTo-Json -Depth 8 -Compress
$pj = $portSpecs | ConvertTo-Json -Depth 6 -Compress
$code = @"
const wires=$wj; const ports=$pj; const out=[];
for(const w of wires){for(const path of w.paths){const r=await eda.sch_PrimitiveWire.create(path,w.net);out.push({kind:'wire',net:w.net,ok:!!r})}}
for(const p of ports){let r;if(p.net==='PGND')r=await eda.sch_PrimitiveComponent.createNetFlag('ProtectGround',p.net,p.x,p.y,p.rot,false);else if(p.net==='AGND')r=await eda.sch_PrimitiveComponent.createNetFlag('AnalogGround',p.net,p.x,p.y,p.rot,false);else if(['VCC','VCC_BUS','VDD_3V3','VDD_LDO'].includes(p.net))r=await eda.sch_PrimitiveComponent.createNetFlag('Power',p.net,p.x,p.y,p.rot,false);else r=await eda.sch_PrimitiveComponent.createNetPort('BI',p.net,p.x,p.y,p.rot,false);out.push({kind:'port',net:p.net,ok:!!r})}
return out;
"@
$body = @{code=$code} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri 'http://localhost:49620/execute' -ContentType 'application/json' -Body $body -TimeoutSec 120 | ConvertTo-Json -Depth 8
