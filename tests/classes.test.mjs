import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizeClass, isClassOpen, updateClass } from '../api/_lib/classes-store.js';
import classesHandler from '../api/classes.js';
import registerHandler from '../api/register.js';

process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.SUPABASE_SECRET_KEY = 'local-test-only';
process.env.APPS_SCRIPT_URL = 'https://fixture.invalid/register';
const sample = {id:'18',name:'吉他入門',teacher:'吳興儒',level:'入門',day:'週四',time:'20:00',startDate:'2026-11-05',endDate:'2026-12-24',price:3600,lessons:8,capacity:10,remaining:2,status:'open',version:1};
function session(){const value = `${Math.floor(Date.now()/1000)+3600}.fixture`;return `${value}.${crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(value).digest('base64url')}`;}
function req(method,body,authenticated=true){return {method,body,headers:{host:'local.test',origin:'https://local.test',...(authenticated?{cookie:`__Host-luby_admin_session=${session()}`}:{})},query:{}};}
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
function stub(c=sample,fail=false){let forwarded=0;globalThis.fetch=async(url,options)=>{
  if(String(url).includes('fixture.invalid')){forwarded++;return {ok:true,text:async()=>'{"status":"ok"}'};}
  if(fail)throw new Error('offline');
  return {ok:true,json:async()=>c?[{id:c.id,data:c,version:c.version}]:[]};
};return ()=>forwarded;}
const payload = () => ({courseType:'group',name:'測試',phone:'0900000000',classId:'18',classVersion:1,finalPrice:3600,transferLast4:'1234',className:sample.name,classTime:sample.time});

test('manual settings accept zero remaining and reject invalid dates, capacity, markup',()=>{
  assert.equal(normalizeClass({...sample,remaining:0}).remaining,0);
  assert.equal(normalizeClass({...sample,remaining:''}).remaining,null);
  for(const patch of [{remaining:11},{remaining:-1},{price:''},{startDate:'2026-02-30'},{endDate:'2026-01-01'},{name:'<script>'},{status:'anything'}])assert.throws(()=>normalizeClass({...sample,...patch}));
  assert.equal(isClassOpen({...sample,remaining:0}),false);
  assert.equal(isClassOpen({...sample,status:'full'}),false);
});
test('admin edits require signed session and same-origin request',async()=>{
  let res=response();await classesHandler(req('PUT',sample,false),res);assert.equal(res.code,401);
  const request=req('PUT',sample);request.headers.origin='https://other.test';res=response();await classesHandler(request,res);assert.equal(res.code,403);
});
test('concurrent edits cannot overwrite a newer version',async()=>{
  globalThis.fetch=async()=>({ok:true,json:async()=>[]});
  await assert.rejects(updateClass(sample,1),/其他人更新/);
});
test('public reads do not require login and are never cached',async()=>{
  stub();const res=response();const request=req('GET',null,false);request.query.public='1';await classesHandler(request,res);
  assert.equal(res.code,200);assert.equal(res.body.classes[0].id,'18');assert.match(res.headers['Cache-Control'],/no-store/);
});
test('closed, full, zero-seat and unknown classes never reach registration upstream',async()=>{
  for(const c of [{...sample,status:'paused'},{...sample,status:'full'},{...sample,remaining:0},null]){
    const forwarded=stub(c),res=response();await registerHandler(req('POST',payload(),false),res);assert.equal(res.code,409);assert.equal(forwarded(),0);
  }
});
test('database outage fails closed',async()=>{
  const forwarded=stub(sample,true),res=response();await registerHandler(req('POST',payload(),false),res);assert.equal(res.code,503);assert.equal(forwarded(),0);
});
test('stale class version, changed time and tampered price require reconfirmation',async()=>{
  for(const patch of [{classVersion:0},{classTime:'19:00'},{finalPrice:1}]){
    const forwarded=stub(),res=response();await registerHandler(req('POST',{...payload(),...patch},false),res);assert.equal(res.code,409);assert.equal(forwarded(),0);
  }
});
test('open class forwards authoritative data without deducting manual seats',async()=>{
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return String(url).includes('fixture.invalid')?{ok:true,text:async()=>'{"status":"ok"}'}:{ok:true,json:async()=>[{id:sample.id,data:sample,version:1}]};};
  const res=response();await registerHandler(req('POST',payload(),false),res);assert.equal(res.code,200);
  assert.equal(calls.length,2);assert.equal(calls[0].options.method,undefined);assert.equal(JSON.parse(calls[1].options.body).classTeacher,'吳興儒');
});
test('individual lesson consultations keep their existing route',async()=>{
  const forwarded=stub(null),res=response();await registerHandler(req('POST',{courseType:'private',name:'測試',phone:'0900000000',timeSlots:['週一'],level:'入門',hasGuitar:'是'},false),res);assert.equal(res.code,200);assert.equal(forwarded(),1);
});
test('preview writes target a separate table',async()=>{
  process.env.VERCEL_ENV='preview';let url;globalThis.fetch=async(value)=>{url=value;return {ok:true,json:async()=>[{id:sample.id,data:sample,version:2}]};};
  await updateClass(sample,1);assert.match(url,/course_classes_preview\?/);delete process.env.VERCEL_ENV;
});
