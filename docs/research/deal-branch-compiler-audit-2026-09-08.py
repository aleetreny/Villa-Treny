"""Offline XGrammar0.2.3 conversion/matcher checks. No model loading or HTTP."""
import sys,json,hashlib,time
from pathlib import Path
sys.path[:0]=['/Applications/oMLX.app/Contents/Resources','/Applications/oMLX.app/Contents/Resources/Python/framework-mlx-base/lib/python3.11/site-packages']
from omlx._torch_stub import install
install()
import xgrammar as xg
from importlib.metadata import version
here=Path(__file__).parent
src=json.loads((here/'deal-branch-compiler-input-2026-09-08.json').read_text())
# ASCII vocabulary suffices for accept_string language tests. This does not
# reproduce probabilities or actual Qwen tokenizer bitmasks.
compiler=xg.GrammarCompiler(xg.TokenizerInfo([bytes([i]) for i in range(128)]+[b'<stop>'],stop_token_ids=[128]),cache_enabled=False)
dump=lambda v:json.dumps(v,separators=(',',':'),ensure_ascii=True)
sha=lambda v:hashlib.sha256(v.encode() if isinstance(v,str) else v).hexdigest()
results={}
for name,schema in src['schemas'].items():
 started=time.perf_counter(); compiled=compiler.compile_json_schema(schema)
 grammar=str(compiled.grammar)
 (here/f'deal-branch-{name}-2026-09-08.ebnf').write_text(grammar)
 def accepts(text,complete=False):
  m=xg.GrammarMatcher(compiled)
  return m.accept_string(text) and (m.is_completed() if complete else True)
 samples={key:accepts(dump(value),True) for key,value in src['samples'].items()}
 project=src['samples']['omittedCloseDeal']['project'];msg=src['samples']['omittedCloseDeal']['message'];deal=src['samples']['omittedCloseDeal']['deal']
 head='{"project":'+dump(project)+',"message":'+dump(msg)
 prefixes={
 'message_omitted_close':accepts(head),
 'message_omitted_close_then_deal':accepts(head+',"deal":'),
 'message_false_close_then_deal':accepts('{"project":'+dump(project)+',"message":'+dump({**msg,'close':False})+',"deal":'),
 'message_false_close_then_finish':accepts('{"project":'+dump(project)+',"message":'+dump({**msg,'close':False})+'}',True),
 'message_true_close_then_deal':accepts('{"project":'+dump(project)+',"message":'+dump({**msg,'close':True})+',"deal":'),
 }
 results[name]={'compiled':True,'compileMs':round((time.perf_counter()-started)*1000,2),'grammarBytes':len(grammar.encode()),'grammarSha256':sha(grammar),'samples':samples,'prefixes':prefixes}
# Verify the previous property-order intervention changed grammar, rather than
# being silently normalized into the same EBNF before matching.
paired=json.loads((here/'model-society-v7-deal-order-local-2026-09-08/ledger.json').read_text())
ordering=[]
for row in paired['attempts'][:2]:
 schema=row['job']['payload']['response_format']['json_schema']['schema']
 g=str(xg.Grammar.from_json_schema(schema))
 ordering.append({'variant':row['job']['variant'],'schemaSha256':sha(dump(schema)),'ebnfSha256':sha(g),'bytes':len(g.encode())})
assert ordering[0]['ebnfSha256']!=ordering[1]['ebnfSha256']
assert not results['current']['prefixes']['message_omitted_close_then_deal']
assert results['implicitOpen']['prefixes']['message_omitted_close_then_deal']
assert not results['implicitOpen']['prefixes']['message_true_close_then_deal']
assert results['requiredClose']['prefixes']['message_false_close_then_deal']
assert results['requiredClose']['prefixes']['message_false_close_then_finish']
assert results['nullableFlat']['samples']['trueCloseDeal']
paths=['/Applications/oMLX.app/Contents/Resources/omlx/server.py','/Applications/oMLX.app/Contents/Resources/omlx/api/grammar.py','/Applications/oMLX.app/Contents/Resources/Python/framework-mlx-base/lib/python3.11/site-packages/xgrammar/grammar.py','/Applications/oMLX.app/Contents/Resources/Python/framework-mlx-base/lib/python3.11/site-packages/xgrammar/compiler.py']
result={'scope':'Offline grammar conversion and ASCII accept_string matcher; not model probabilities, token masks or inference.','httpRequests':0,'loadedModelWeights':False,'xgrammarVersion':version('xgrammar'),'pythonVersion':sys.version,'compilerCacheEnabled':False,'sourceFiles':[{'path':p,'sha256':sha(Path(p).read_bytes())} for p in paths],'propertyOrderChangedEbnf':ordering,'variants':results}
(here/'deal-branch-compiler-audit-2026-09-08.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:{'bytes':v['grammarBytes'],'compileMs':v['compileMs'],'prefixes':v['prefixes']} for k,v in results.items()},indent=2))
