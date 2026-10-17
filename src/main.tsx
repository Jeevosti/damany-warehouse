import {StrictMode,Component} from 'react';
import './damany-addons';
import type {ReactNode,ErrorInfo} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import App from './App';
import './styles.css';
import './login.css';
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(error:Error,info:ErrorInfo){console.error(error,info);}render(){return this.state.failed?<div className="fatal-error"><h1>Let's get your workspace back.</h1><p>A page error interrupted the app. Reload to try again.</p><button className="btn btn-primary" onClick={()=>location.reload()}>Reload workspace</button></div>:this.props.children;}}
const client=new QueryClient({defaultOptions:{queries:{staleTime:15000,retry:1},mutations:{retry:0}}});
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><QueryClientProvider client={client}><App/></QueryClientProvider></ErrorBoundary></StrictMode>);
