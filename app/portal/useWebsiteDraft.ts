"use client";
import { useState, type SetStateAction } from "react";
import type { WebsiteContent } from "@/lib/website-content";
export function useWebsiteDraft(initial: WebsiteContent) {
  const [state,setState]=useState({content:initial,past:[] as WebsiteContent[],future:[] as WebsiteContent[],saved:JSON.stringify(initial)});
  function setContent(action: SetStateAction<WebsiteContent>) {setState(s=>{const content=typeof action==="function"?action(s.content):action;if(JSON.stringify(content)===JSON.stringify(s.content))return s;return {...s,content,past:[...s.past,s.content].slice(-30),future:[]};});}
  function markSaved(content: WebsiteContent){setState({content,past:[],future:[],saved:JSON.stringify(content)});}
  function undo(){setState(s=>!s.past.length?s:{...s,content:s.past.at(-1)!,past:s.past.slice(0,-1),future:[s.content,...s.future]});}
  function redo(){setState(s=>!s.future.length?s:{...s,content:s.future[0],past:[...s.past,s.content],future:s.future.slice(1)});}
  return {content:state.content,setContent,markSaved,undo,redo,canUndo:!!state.past.length,canRedo:!!state.future.length,dirty:JSON.stringify(state.content)!==state.saved};
}
