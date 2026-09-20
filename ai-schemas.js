// Strict output schemas keep LaTeX strings inside real JSON, without double serialization.
const string = {type:'string'}, number={type:'number'}, boolean={type:'boolean'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=items=>({type:'array',items});
const bbox={x:number,y:number,w:number,h:number};
export const modelSchemas={
 analyze:object({text_blocks:array(object({...bbox,text:string})),image_regions:array(object({...bbox,kind:{enum:['diagram','photo'],type:'string'},detail:{enum:['clean','detail'],type:'string'},confidence:number}))}),
 ocr:object({blocks:array(object({index:number,text:string}))}),
 image:object({kind:{enum:['diagram','photo'],type:'string'},detail:{enum:['clean','detail'],type:'string'},content_bbox:object(bbox),exclude_regions:array(object(bbox)),semantic:object({confidence:number,source_label_count:number,vertices:array(object({id:string,label:string,x:number,y:number,label_x:number,label_y:number})),edges:array(object({from:string,to:string,kind:{type:'string',enum:['segment','extension','ray']}})),auxiliaries:array(object({x1:number,y1:number,x2:number,y2:number,kind:{type:'string',enum:['tick','arrow','other']},keep:boolean})),annotations:array(object({text:string,x:number,y:number,size:number})),removed_noise:array(string)}),description:string}),
 personalize:object({textSize:number,textY:number,imageScale:number,imageY:number,lineWidth:number,detail:{enum:['clean','detail'],type:'string'},summary:string}),
};
