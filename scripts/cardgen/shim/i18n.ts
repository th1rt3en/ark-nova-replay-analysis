import i18n from 'i18next';
import en from '../site/locales/en/common.json';
i18n.init({lng:'en',fallbackLng:'en',ns:['common'],defaultNS:'common',resources:{en:{common:en as any}},interpolation:{escapeValue:false},initImmediate:false});
export const useTranslation=(_ns?:any)=>({t:(k:string,o?:any)=>i18n.t(k,o) as string,i18n});
export const Trans=(p:any)=>p.children;
