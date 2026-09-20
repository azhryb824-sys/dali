import React, {Component, Suspense, lazy} from 'react';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {setClientLocale,readClientLocale} from '../../lib/client-locale';
import {translateLocaleTree} from '../../lib/locale-dom';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import PortalDashboard from '../../app/portal/PortalDashboard';
import LocaleRuntime from '../../app/components/LocaleRuntime';
import {WebsiteContentProvider} from '../../app/components/WebsiteContentProvider';
import {AppDialogProvider} from '../../app/components/AppDialogProvider';
import PortalError from '../../app/portal/error';
import {DEFAULT_WEBSITE_CONTENT} from '../../lib/website-content';
import {defaultBusinessHours} from '../../lib/business-hours';
import {defaultChatAutomation} from '../../lib/chat-automation';
const router = {back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};
export class Boundary extends Component{state={error:null};static getDerivedStateFromError(error){return{error}};render(){return this.state.error ? <PortalError error={this.state.error} reset={()=>this.setState({error:null})}/> : this.props.children}}
export function Dashboard({locale='ar'}){
 const props={currentUser:{email:'qa@example.test',displayName:'مستخدم الاختبار',role:'admin',department:'general',functionalRoles:['system_owner'],functionalPermissions:['*'],preferredLanguage:locale},currentDateLabel:'الأحد 20 سبتمبر 2026',initialBusinessHours:{...defaultBusinessHours,isOpen:true,exception:null,replyKey:'open',nextOpenLabel:''},initialChatAutomation:defaultChatAutomation,initialWebsiteContent:DEFAULT_WEBSITE_CONTENT,signOutPath:'/logout'};
 for(const key of ['Requests','RequestReplies','Notifications','Users','Activity','Employees','Finance','Legal','Workers','WorkerAttachments','Documents','Assets','Contracts','ContractProfessions','ContractAssignments','Conversations','ConversationMessages'])props['initial'+key]=[];
 for(const key of ['canAccessWebsite','canManageWebsite','canAccessConstruction','canManageChatSettings','canManageDocuments','canShareDocuments','canManageAssets','emailConfigured'])props[key]=true;
 return <PortalDashboard {...props}/>;
}
const DelayedDashboard = lazy(() => new Promise(resolve => setTimeout(() => resolve({ default: Dashboard }), 500)));
export function App({locale='ar',delay=false}){
 const D = delay && typeof window !== 'undefined' ? DelayedDashboard : Dashboard;
 return <AppRouterContext.Provider value={router}><PathnameContext.Provider value="/portal"><LocaleRuntime initialLocale={locale}/><WebsiteContentProvider content={DEFAULT_WEBSITE_CONTENT}><AppDialogProvider><Boundary><Suspense fallback={<p>جارٍ التحميل...</p>}><D locale={locale}/></Suspense></Boundary></AppDialogProvider></WebsiteContentProvider></PathnameContext.Provider></AppRouterContext.Provider>;
}

export function exposeProbe() { window.localeProbe = { setClientLocale, readClientLocale, translateLocaleTree }; }
