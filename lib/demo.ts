import type { Provider, Package } from './types';
const names=['Lintas Fiber','Orbit Rumah','Koneksi Kita','Urban Net'];
export const demoProviders:Provider[]=names.map((name,i)=>({id:`demo-${i}`,name,url:'https://example.com',domain:`contoh-${i+1}.example`,city:'Jakarta',status:'approved',checkedAt:null}));
export const demoPackages:Package[]=[50,100,150,200,300,75].map((speed,i)=>({id:`sample-${i}`,providerId:`demo-${i%4}`,provider:names[i%4],name:['Home Essential','Family Connect','Home Pro','Stream Plus','Ultra Home','Everyday'][i],speed,price:[249000,329000,399000,459000,599000,289000][i],city:'Jakarta',url:'https://example.com',evidence:'Data ilustrasi untuk mencoba tampilan. Bukan penawaran provider sesungguhnya.',status:'review',capturedAt:'',tax:'Belum diketahui'}));
