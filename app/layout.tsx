import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ScrapNet — Internet, lebih terbuka.',description:'Temukan provider dan bandingkan paket internet dalam satu tempat.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>;}
