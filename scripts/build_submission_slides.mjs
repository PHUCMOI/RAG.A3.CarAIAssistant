// Run a copy from .local/deck-build with the bundled artifact-tool node_modules.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from '@oai/artifact-tool';

const root=process.cwd();
const skill=process.env.PRESENTATION_SKILL_DIR;
const python=process.env.PRESENTATION_PYTHON;
if(!skill || !python) throw new Error('Set PRESENTATION_SKILL_DIR and PRESENTATION_PYTHON to the bundled runtime paths');
const {finalizePresentation,resolvePresentationFont}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const font=resolvePresentationFont();
const build=path.join(root,'.local/deck-build');
const summary=JSON.parse(await fs.readFile(path.join(root,'docs/submission/evidence/live-evaluation.summary.json'),'utf8'));
const p=Presentation.create({slideSize:{width:1280,height:720}});
const tableOwners=[];
const color={bg:'#F4F6F1',ink:'#173F36',body:'#283832',muted:'#56695F'};
function text(slide,value,x,y,w,h,size=28,fill=color.body,bold=false){
 const s=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 s.text=value; s.text.style={typeface:font,fontSize:size,color:fill,bold}; return s;
}
function slide(title,source){
 const s=p.slides.add();s.background.fill=color.bg;
 text(s,title,64,46,1152,108,44,color.ink,true);
 text(s,String(p.slides.items.length).padStart(2,'0'),1170,668,50,26,17,color.muted);
 s.speakerNotes.text=source;return s;
}
function paragraphs(s,items,y=194){items.forEach((v,i)=>text(s,v,70,y+i*100,1100,86,29));}
function table(s,values,y=190,widths){
 tableOwners.push(p.slides.items.indexOf(s)+1);
 const t=s.tables.add({rows:values.length,columns:values[0].length,left:70,top:y,width:1140,height:values.length*66,values,columnWidths:widths});
 t.borders.assign({fill:'#D1DAD1',width:1});
 for(let r=0;r<values.length;r++) for(let c=0;c<values[0].length;c++){
   const cell=t.getCell(r,c);cell.fill=r===0?color.ink:'#FFFFFF';
   cell.text.style={typeface:font,fontSize:25,color:r===0?'#FFFFFF':color.body,bold:r===0};
 }
 return t;
}
let s=p.slides.add();s.background.fill=color.ink;
text(s,'AutoWise',70,180,1120,110,84,'#F4F6F1',true);
text(s,'Trợ lý tư vấn ô tô với text và image RAG',74,316,1100,100,39,'#DDE9DC');
text(s,'Báo cáo kỹ thuật • 11/10/2026',76,545,1100,45,25,'#DDE9DC');
s.speakerNotes.text='Bản nháp thuyết trình của project. Bổ sung tên nhóm và rubric trước khi nộp. Nguồn: docs/submission/technical-report.md.';
s=slide('Bài toán và phạm vi','Nguồn: README.md; docs/submission/technical-report.md.');
paragraphs(s,['Tra cứu, lọc và so sánh xe theo dữ liệu có nguồn.','Hỏi giá, thông số, bảo hành, đại lý bằng tiếng Việt.','Dùng ảnh để tìm mẫu gần giống trong catalogue.','Customer và admin có quyền truy cập riêng cho đơn hàng.']);
s=slide('Giao diện tra cứu','Ảnh giao diện thật chụp localhost:5173 ngày 11/10/2026. Không có dữ liệu fixture thay thế.');
let raw=await fs.readFile(path.join(build,'home.png'));
s.images.add({blob:raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),contentType:'image/png',alt:'Trang chủ AutoWise',fit:'contain',position:{left:210,top:163,width:860,height:500}});
s=slide('Dữ liệu và giới hạn nguồn','Nguồn: database/seed.sql, database/004_seed_dealers.sql; docs/submission/evidence/fresh-database.json; eval/submission_ground_truth_audit.json.');
table(s,[['Dữ liệu seed','Số lượng'],['Mẫu xe / ảnh','50 / 215'],['Đại lý / bảo hành','22 / 9'],['Nguồn tham khảo','61']],180,[760,380]);
text(s,'Thông số UK chưa xác nhận phiên bản Việt Nam. Giá có ngày tham khảo.',70,520,1110,100,27,color.ink);
s=slide('Các thành phần hệ thống','Nguồn: docker-compose.yml; docs/chat-pipeline-bedrock.md; services/owner-features/src.');
table(s,[['Thành phần','Vai trò'],['React + Nginx','Giao diện và proxy'],['Python FastAPI','SQL, text RAG, điều phối ảnh'],['CLIP + FAISS','Xếp hạng mẫu xe gần giống'],['C# + PostgreSQL','Auth, đơn hàng, lịch sử'],['Bedrock + E5/pgvector','Hiểu câu hỏi, viết và kiểm chứng']],172,[430,710]);
s=slide('Luồng trả lời có kiểm chứng','Nguồn: backend/app/routers/chat.py; backend/app/infrastructure/ai/natural_answers.py.');
paragraphs(s,['1. Hiểu câu hỏi → lọc SQL → lấy ranked contexts.','2. Tạo draft từ facts và nguồn đã truy xuất.','3. Bedrock viết câu cuối; server bổ sung source qualifiers.','4. Kiểm số liệu và semantic audit; không đạt thì từ chối.']);
s=slide('Phương pháp đánh giá','Nguồn: eval/ground_truth_submission.jsonl; eval/run_text_evaluation.py; eval/submission_ground_truth_audit.json.');
paragraphs(s,['200 mẫu nháp: 150 text và 50 ảnh / ảnh + text / ảnh lỗi.','44 ảnh holdout: kiểm hash, không trùng ảnh trong index.','P/R@5 dùng ranked context IDs; image đo Recall@1/@5 và MRR.','Nhãn, faithfulness và completeness còn chờ review chéo.']);
s=slide('Kết quả evaluation baseline','Nguồn: docs/submission/evidence/live-evaluation.summary.json; baseline-runtime-identity.json. Ground truth SHA256: '+summary.ground_truth_sha256+'. P/R là text contexts; SQL facts không thuộc metric này.');
const fmt=x=>x==null?'N/A':x.toFixed(3);
table(s,[['Split','Mẫu','Lỗi','P@5','R@5'],...Object.entries(summary.splits).map(([name,v])=>[name,String(v.cases),String(v.errors),fmt(v.context_precision_at_5),fmt(v.context_recall_at_5)])],210,[360,180,180,210,210]);
text(s,`${summary.completed_cases}/${summary.selected_cases} mẫu đã ghi • Nhãn chưa review`,70,476,1110,65,32,color.ink,true);
text(s,'Số liệu diagnostics; chưa dùng làm điểm nghiệm thu độc lập.',70,550,1110,65,27,color.muted);
s=slide('Kết quả image retrieval','Nguồn: docs/submission/evidence/live-evaluation.summary.json. Metric từ image search riêng, không đồng nhất với chat end-to-end. 49 truy vấn ảnh hợp lệ từ 44 ảnh unique; ảnh lỗi không có image ranking.');
table(s,[['Split','Mẫu','@1','@5','MRR'],...Object.entries(summary.splits).map(([name,v])=>[name,String(v.image_recall_at_1_samples),fmt(v.image_recall_at_1),fmt(v.image_recall_at_5),fmt(v.image_mrr_at_5)])],210,[360,180,180,210,210]);
text(s,'49 truy vấn ảnh hợp lệ dùng 44 ảnh holdout khác nhau.',70,486,1110,90,29,color.ink);
text(s,'Ảnh gần giống không xác nhận chiếc xe hoặc VIN.',70,582,1110,65,27,color.muted);
const postfixPath=path.join(root,'docs/submission/evidence/postfix-evaluation.summary.json');
try{
 const postfix=JSON.parse(await fs.readFile(postfixPath,'utf8'));
 s=slide('Kiểm tra sau sửa SQL evidence','Nguồn: docs/submission/evidence/postfix-evaluation.summary.json; postfix-runtime-identity.json. Lượt riêng, không thay baseline Q089 bị HTTP 503.');
 table(s,[['Split','Mẫu','Lỗi','Intent','Status'],...Object.entries(postfix.splits).map(([name,v])=>[name,String(v.cases),String(v.errors),fmt(v.intent_correct),fmt(v.status_correct)])],210,[360,180,180,210,210]);
 text(s,`${postfix.completed_cases}/${postfix.selected_cases} mẫu kiểm tra riêng sau sửa`,70,486,1110,90,29,color.ink);
 text(s,'Baseline vẫn giữ Q089 HTTP 503 trong thống kê.',70,582,1110,65,27,color.muted);
}catch(error){if(error.code!=='ENOENT')throw error;}
s=slide('Các lượt live trước release','Nguồn: docs/submission/evidence/referencefix-evaluation.summary.json; final-smoke.json. Các lượt trước bị lỗi vẫn được giữ riêng.');
paragraphs(s,['Q085 / Q089 / Q152: lượt regression riêng đạt 3/3.','Smoke Bedrock thật: 5/5 intent đạt trên bản IDs thống nhất.','Ranked retrieval giữ nguyên; supporting SQL facts có nguồn.','Lượt release đầy đủ được báo cáo riêng ở trang tiếp theo.']);
const release=JSON.parse(await fs.readFile(path.join(root,'docs/submission/evidence/release-evaluation.summary.json'),'utf8'));
s=slide('Evaluation trên runtime release','Nguồn: docs/submission/evidence/release-evaluation.summary.json; release-evaluation.responses.json; release-runtime-identity.json. Ground truth SHA256: '+release.ground_truth_sha256+'. Nhãn còn pending review.');
table(s,[['Split','Mẫu','Lỗi','P@5','R@5'],...Object.entries(release.splits).map(([name,v])=>[name,String(v.cases),String(v.errors),fmt(v.context_precision_at_5),fmt(v.context_recall_at_5)])],210,[360,180,180,210,210]);
text(s,`${release.completed_cases}/${release.selected_cases} mẫu đã ghi${release.completed_cases<release.selected_cases?' • Đang chạy':' • Hoàn tất lượt chạy'}`,70,476,1110,65,32,color.ink,true);
text(s,'Lỗi được giữ trong thống kê; điểm người review chưa được chấm.',70,550,1110,65,27,color.muted);
const repairPath=path.join(root,'docs/submission/evidence/reference-repair-evaluation.summary.json');
try{
 const repair=JSON.parse(await fs.readFile(repairPath,'utf8'));
 s=slide('Regression sau sửa reviewer','Nguồn: docs/submission/evidence/reference-repair-evaluation.summary.json; reference-repair-runtime-identity.json. Không thay thế lượt release 200 mẫu.');
 table(s,[['Split','Mẫu','Lỗi','Intent','Status'],...Object.entries(repair.splits).map(([name,v])=>[name,String(v.cases),String(v.errors),fmt(v.intent_correct),fmt(v.status_correct)])],210,[360,180,180,210,210]);
 text(s,`${repair.completed_cases}/${repair.selected_cases} case regression đã ghi`,70,486,1110,80,29,color.ink);
 text(s,'Các lỗi release vẫn được giữ; nhãn còn chờ review.',70,578,1110,65,27,color.muted);
}catch(error){if(error.code!=='ENOENT')throw error;}
s=slide('Kiểm thử regression và tái lập','Nguồn: docs/submission/fixes-2026-10-11.md; docs/submission/evidence/fresh-database.json. AWS/HTTP opt-in khác với fixture regression.');
table(s,[['Bộ kiểm thử','Kết quả'],['Backend + PostgreSQL','194 passed'],['Frontend unit / browser','96 passed / 78 passed, 20 skipped'],['C# / image service','142 passed, 5 skipped / 24 passed'],['Seed DB riêng / npm ci + build','Đạt / đạt']],178,[520,620]);
text(s,'Chưa xác nhận triển khai đầy đủ trên máy mới hoặc tải production.',70,568,1110,70,27,color.muted);
s=slide('Ba tình huống lỗi tiêu biểu','Nguồn: docs/final-review-2026-10-11.md; docs/submission/evidence/initial-diagnostic.responses.json; image_service/indexes/ablation_study_results.md.');
paragraphs(s,['Thiếu cảnh báo nguồn hoặc mô tả xe lịch sử đang bán → audit từ chối.','Ảnh gần giống có thể xếp model khác lên top 1 → cần uncertainty.','AWS throttling có thể gây 503 dù DB và index healthy.'],205);
text(s,'Giữ lỗi trong thống kê. Không bỏ validation để demo trả lời được.',70,560,1110,65,29,color.ink,true);
s=slide('Kịch bản demo 7 phút','Nguồn: docs/submission/README.md. Demo cần dùng tài khoản test của nhóm, không dùng dữ liệu cá nhân thật.');
paragraphs(s,['Catalogue → lọc → chi tiết → so sánh và nguồn.','Chat text → giá/bảo hành → ảnh holdout và uncertainty.','Guest → customer → lịch sử; admin → tra cứu đúng quyền.','Hiện bảng đánh giá, failure cases và giới hạn dữ liệu.']);
s=slide('Điều kiện chốt bản nộp','Nguồn: docs/submission/README.md; docs/submission/human-review-template.csv.');
paragraphs(s,['Hoàn tất evaluation và xử lý lỗi quan sát được.','Nhóm review nhãn và chấm claims / required facts.','Bổ sung tên thành viên, rubric và recording demo.','Đóng gói source, evidence, báo cáo và slide từ cùng một bản.']);

const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const candidate=path.join(build,`candidate-${stamp}.pptx`);
await (await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(root,'docs/submission/slides',`AutoWise-release-${release.completed_cases}of${release.selected_cases}-${stamp}.pptx`);
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,pythonExecutable:python,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...tableOwners.flatMap(n=>['--require-native-table-slide',String(n)])],
 requiredNativeTableOwnerSlides:tableOwners,requiredNativeChartOwnerSlides:[],
 fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,
 receiptPath:path.join(build,`validation-${stamp}.json`)});
for(const [i,sl] of p.slides.items.entries()){
 const png=await p.export({slide:sl,format:'png',scale:1});
 await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));
}
await fs.writeFile(path.join(build,'latest.json'),JSON.stringify({finalPath,font,
 baselineCompletedCases:summary.completed_cases,releaseCompletedCases:release.completed_cases,
 releaseSelectedCases:release.selected_cases}));
console.log(finalPath);
