// Display labels are separate from persisted identifiers so existing notes survive.
const labels:Record<string,string>={'全部':'All','研究问题':'Research questions','实验方法':'Methods','关键结果':'Key findings','局限性':'Limitations','我的疑问':'My questions','基础词':'Basic word','专业术语':'Technical term','重要动词':'Key verb','固定搭配':'Phrase','专业词汇':'Technical term','文献事实':'Paper fact','AI推断':'AI inference','AI 推断':'AI inference'};
export const label=(value:string)=>labels[value]||value;

export const noteOriginLabel=(origin:string)=>origin==='ai'?'AI-assisted':origin==='translation'?'Translation':'Personal note';
