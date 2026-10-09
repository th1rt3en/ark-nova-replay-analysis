import React from 'react';
export default function Image(p:any){const {src,alt,width,height,className,style}=p;const s=typeof src==='string'?src:(src&&src.src)||'';return <img src={s} alt={alt||''} width={width} height={height} className={className} style={style}/>;}
