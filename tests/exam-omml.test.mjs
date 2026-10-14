import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {zipSync,strToU8} from 'fflate';
import katex from 'katex';
import {ommlToLatex,extractDocx,splitQuestions} from '../src/exam/documents.mjs';
const r=text=>'<m:r><m:t>'+text+'</m:t></m:r>',e=text=>'<m:e>'+r(text)+'</m:e>';
const math=xml=>ommlToLatex(new DOMParser().parseFromString('<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'+xml+'</m:oMath>','application/xml').documentElement);
const cases=[
 ['matrix retains rows and columns','<m:m><m:mr>'+e('1')+e('2')+'</m:mr><m:mr>'+e('3')+e('4')+'</m:mr></m:m>','\\begin{matrix}1&2\\\\3&4\\end{matrix}'],
 ['piecewise brace retains absent right delimiter','<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr>'+e('x')+'</m:d>','\\left\\{x\\right.'],
 ['default separator is a vertical bar, not a comma','<m:d>'+e('x')+e('y')+'</m:d>','\\left(x|y\\right)'],
 ['explicit empty separator is preserved','<m:d><m:dPr><m:sepChr m:val=""/></m:dPr>'+e('x')+e('y')+'</m:d>','\\left(xy\\right)'],
 ['time derivative dot is not a hat','<m:acc><m:accPr><m:chr m:val="̇"/></m:accPr>'+e('x')+'</m:acc>','\\dot{x}'],
 ['second derivative keeps both dots','<m:acc><m:accPr><m:chr m:val="̈"/></m:accPr>'+e('x')+'</m:acc>','\\ddot{x}'],
 ['isotope left scripts are not concatenated into its symbol','<m:sPre><m:sub>'+r('2')+'</m:sub><m:sup>'+r('4')+'</m:sup>'+e('He')+'</m:sPre>','{}_{2}^{4}{He}'],
 ['integral hidden limits do not appear','<m:nary><m:naryPr><m:chr m:val="∫"/><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub>'+r('0')+'</m:sub><m:sup>'+r('1')+'</m:sup>'+e('x')+'</m:nary>','\\int x'],
 ['root with hidden degree is square root','<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg>'+r('3')+'</m:deg>'+e('x')+'</m:rad>','\\sqrt{x}']
];
for(const [name,xml,expected] of cases)test('OMML '+name,()=>{const actual=math(xml);assert.equal(actual,expected);assert.doesNotThrow(()=>katex.renderToString(actual,{throwOnError:true,strict:'error'}));});
test('structured formulas survive real DOCX bytes in body/table and keep references separate',()=>{
 const xml='<w:document xmlns:w="urn:w" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:r><w:t>1. 虚构公式验收</w:t></w:r><m:oMath>'+cases[0][1]+'</m:oMath></w:p><w:tbl><w:tr><w:tc><w:p><m:oMath>'+cases[1][1]+'</m:oMath></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
 const file=zipSync({'word/document.xml':strToU8(xml)}),parsed=extractDocx(file);
 assert.equal(parsed.paragraphs.length,2);assert(parsed.paragraphs[0].text.includes(cases[0][2]));assert(parsed.paragraphs[1].text.includes(cases[1][2]));
});

test('automatic navigation titles omit formulas without changing complete source text',()=>{
 const text=String.raw`1. 虚构公式题 $\frac{mv}{qB}$ 比较半径与 $\sqrt{2}$`;
 const [question]=splitQuestions([{index:0,text,images:[]}]);
 assert.equal(question.title,'1. 虚构公式题 比较半径与');assert.equal(question.text,text);
 const [formulaOnly]=splitQuestions([{index:0,text:'2. $'+String.raw`\begin{matrix}1&2\\3&4\end{matrix}`+'$',images:[]}]);
 assert.equal(formulaOnly.title,'2. 题目');assert(formulaOnly.text.includes('matrix'));
});
