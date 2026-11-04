import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateSources,validatedCitations,validateAnalysis} from '../server/ai.mjs';
test('citation pages and excerpts come from supplied source map, not model claims',()=>{const sources=validateSources([{id:'S1',page:4,text:'The sample was measured.'}]);assert.deepEqual(validatedCitations(['S1','S999'],sources),sources);assert.deepEqual(validatedCitations(['S999'],sources),[])});
test('unbounded and malformed contexts are rejected',()=>{assert.throws(()=>validateSources([]));assert.throws(()=>validateSources([{id:'S1',page:-1,text:'test'}]));assert.throws(()=>validateSources([{id:'S1',page:1,text:'x'.repeat(27000)}]));assert.throws(()=>validateSources([{id:'S1',page:1,text:'one'},{id:'S1',page:2,text:'two'}]))});
test('malformed AI analysis is an error, never substituted with a fake answer',()=>{assert.throws(()=>validateAnalysis({translation:'hello'}));assert.throws(()=>validateAnalysis({}));});
