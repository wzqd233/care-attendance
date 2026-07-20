const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const DAYS = ['mon','tue','wed','thu','fri'];

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch(e){}
  return { cares:[], stus:[], att:{}, logs:[] };
}
function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2),'utf8'); } catch(e){ console.error('保存失败',e); }
}

let appData = loadData();

app.use(express.static(path.join(__dirname,'public')));
app.use(express.json({limit:'10mb'}));

app.get('/api/data',(req,res)=>res.json(appData));
app.post('/api/data',(req,res)=>{ appData=req.body; saveData(appData); io.emit('data-updated',appData); res.json({ok:true}); });

function applyPatch(type, payload) {
  switch(type) {
    case 'addCare': appData.cares.push(payload); break;
    case 'updateCare': { const c=appData.cares.find(x=>x.id===payload.id); if(c)Object.assign(c,payload); break; }
    case 'delCare': appData.cares=appData.cares.filter(x=>x.id!==payload.id); appData.stus=appData.stus.filter(s=>s.cc!==payload.id); break;
    case 'addStu': appData.stus.push(payload); break;
    case 'updateStu': { const s=appData.stus.find(x=>x.key===payload.key); if(s)Object.assign(s,payload); break; }
    case 'delStu': appData.stus=appData.stus.filter(x=>x.key!==payload.key); break;
    case 'setAtt': {
      const {weekKey,stuKey,day,value}=payload;
      if(!appData.att[weekKey])appData.att[weekKey]={};
      if(!appData.att[weekKey][stuKey])appData.att[weekKey][stuKey]={sch:{},pres:{}};
      if(value===null) delete appData.att[weekKey][stuKey].pres[day];
      else appData.att[weekKey][stuKey].pres[day]=value;
      break;
    }
    case 'setAttSch': {
      const {weekKey,stuKey,day,value}=payload;
      if(!appData.att[weekKey])appData.att[weekKey]={};
      if(!appData.att[weekKey][stuKey])appData.att[weekKey][stuKey]={sch:{},pres:{}};
      appData.att[weekKey][stuKey].sch[day]=value;
      if(value!=='基础托管') delete appData.att[weekKey][stuKey].pres[day];
      else if(appData.att[weekKey][stuKey].pres[day]===undefined) appData.att[weekKey][stuKey].pres[day]=false;
      break;
    }
    case 'syncSch': {
      const {stuKey,sch}=payload;
      const s=appData.stus.find(x=>x.key===stuKey);
      if(s) s.sch=sch;
      Object.keys(appData.att).forEach(wk=>{
        const rec=appData.att[wk]&&appData.att[wk][stuKey];
        if(rec&&!DAYS.some(d=>rec.pres&&rec.pres[d]===true)){rec.sch={...sch};rec.pres={};}
      });
      break;
    }
    case 'addLog': appData.logs.unshift(payload); if(appData.logs.length>600)appData.logs=appData.logs.slice(0,300); break;
    case 'fullReplace': appData=payload; break;
  }
}

app.post('/api/patch',(req,res)=>{ applyPatch(req.body.type,req.body.payload); saveData(appData); io.emit('data-updated',appData); res.json({ok:true}); });

io.on('connection',(socket)=>{
  console.log('设备连接: '+socket.id+' (在线: '+io.engine.clientsCount+')');
  socket.emit('data-updated',appData);
  socket.on('patch',(msg)=>{ applyPatch(msg.type,msg.payload); saveData(appData); socket.broadcast.emit('data-updated',appData); });
  socket.on('disconnect',()=>{ console.log('设备断开: '+socket.id+' (在线: '+io.engine.clientsCount+')'); });
});

server.listen(PORT,'0.0.0.0',()=>{
  const nets=require('os').networkInterfaces();
  let ip='';
  for(const n of Object.values(nets)){for(const c of n){if(c.family==='IPv4'&&!c.internal){ip=c.address;break}}if(ip)break}
  console.log('');
  console.log('============================================');
  console.log('  ✅ 托管考勤服务器已启动！');
  console.log('');
  console.log('  📱 手机/电脑访问:');
  console.log('     http://'+ip+':'+PORT);
  console.log('');
  console.log('  💻 本机也可访问:');
  console.log('     http://localhost:'+PORT);
  console.log('');
  console.log('  ⚠️  手机和电脑需连同一个WiFi');
  console.log('============================================');
  console.log('');
});