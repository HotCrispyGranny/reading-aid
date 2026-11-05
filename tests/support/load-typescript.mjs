// Test-only loader: exercise the actual TS geometry/component functions without
// Vite, a browser, or a listener. Dependencies/globals are explicit test doubles.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {compileFunction} from 'node:vm';
import ts from 'typescript';
export function loadTypeScript(url,dependencies={},globals={}){
 const filename=fileURLToPath(url),require=createRequire(url),module={exports:{}};
 const {outputText}=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 compileFunction(outputText,['module','exports','require','window','document'],{filename})(module,module.exports,name=>Object.hasOwn(dependencies,name)?dependencies[name]:require(name),globals.window,globals.document);
 return module.exports;
}
