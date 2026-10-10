const fs=require("fs");
const https=require("https");
const url=process.argv[2], dst=process.argv[3];
https.get(url,{headers:{"User-Agent":"Mozilla/5.0"}},res=>{
  console.log("status",res.statusCode,res.headers["content-type"]);
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){console.log("redirect",res.headers.location);}
  const f=fs.createWriteStream(dst);
  res.pipe(f); f.on("finish",()=>{f.close();console.log("saved",fs.statSync(dst).size);});
}).on("error",e=>console.log("ERR",e.message));
