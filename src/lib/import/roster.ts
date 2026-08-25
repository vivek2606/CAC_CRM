export type RosterEntry = {
  name: string;
  division: "Sales" | "Service" | "Design" | "Others" | "Retail";
  active: boolean;
  email?: string;
  title?: string;
};

// Historical salesperson roster from the Orion ERP sales register (2020-2026).
// "active" accounts get real logins; everyone else is preserved as an
// inactive record so historical deals still show the correct owner.
export const SALES_REGISTER_ROSTER: RosterEntry[] = [
  { name: "AWOSANYA ADEBAYO", division: "Design", active: false },
  { name: "ADEDAPO OKUNADE SIKIRU", division: "Service", active: true, email: "service@somotexnig.com", title: "Service Manager" },
  { name: "ADEYEMI VICTOR ADEMOLA", division: "Others", active: false },
  { name: "AHUEKWE CHIOMA LILIAN", division: "Others", active: false },
  { name: "ALAO TAIWO FEMI", division: "Others", active: false },
  { name: "AMOS BUCHI COLLINS", division: "Others", active: false },
  { name: "ANI STEPHEN OBUMNEKE", division: "Sales", active: false },
  { name: "ANITA  AIGBE", division: "Sales", active: false },
  { name: "ANUOLUPO TALABI", division: "Sales", active: false },
  { name: "BENSON ITOHOWO IBORO", division: "Sales", active: false },
  { name: "BLESSING NKEOLISE OSOKOGU", division: "Others", active: false },
  { name: "BLESSING ONWUKWE", division: "Others", active: false },
  { name: "CALISTA C UDEKWE", division: "Others", active: false },
  { name: "CELINAH OLUWAMAYO OJO", division: "Sales", active: true, email: "cacsales4@somotexnig.com", title: "Sales Manager" },
  { name: "CHARLES UKAZU", division: "Others", active: false },
  { name: "CHIOMA ADUMEKWE", division: "Sales", active: true, email: "chioma.a@somotexnig.com", title: "Sales Manager" },
  { name: "Chioma Catherine Akobundu", division: "Sales", active: false },
  { name: "CHRIS- CAC", division: "Sales", active: true, email: "cac-techsales@somotexnig.com", title: "Sales Manager" },
  { name: "Chris Nwafor (CPD/SAB)", division: "Others", active: false },
  { name: "CHUCKS AJAJA -ONI", division: "Others", active: false },
  { name: "CHUKS ROWLAND", division: "Others", active: false },
  { name: "CLEMENT ADEBOYE", division: "Others", active: false },
  { name: "DINESH KILLEKAR", division: "Others", active: false },
  { name: "DOSU TEMITOPE CLAUDINE", division: "Others", active: false },
  { name: "EFFIONG IDORENYIN A", division: "Others", active: false },
  { name: "EKEH UCHE", division: "Others", active: false },
  { name: "EMMANUEL EKENE AGBO", division: "Others", active: false },
  { name: "Emmanuel Madumere- PHC", division: "Others", active: false },
  { name: "Enyeribe Confidence Mary", division: "Others", active: false },
  { name: "ESTHER OKO", division: "Others", active: false },
  { name: "FREDINAND", division: "Others", active: false },
  { name: "Idowu Mayode Mercy", division: "Others", active: false },
  { name: "ISA IBRAHIM NDA", division: "Others", active: false },
  { name: "Itamuko Omniyi Johnson", division: "Sales", active: false },
  { name: "JAMES KING", division: "Others", active: false },
  { name: "JUDITH ONYINYE ENETE", division: "Sales", active: false },
  { name: "KAZEEM RAMONI", division: "Sales", active: true, email: "cacsalesabuja2@somotexnig.com", title: "Sales Manager" },
  { name: "KILANI ADEKUNLE LUKMAN", division: "Others", active: false },
  { name: "LEVI CHIGOZIRI UGWUNNAYA", division: "Others", active: false },
  { name: "MARY SILAS CHIOMA", division: "Others", active: false },
  { name: "NIGER AZU", division: "Retail", active: false },
  { name: "NYONG DAISY AMATIYE-CAC", division: "Sales", active: false },
  { name: "OBIAZOR AZUKA-B2B", division: "Others", active: false },
  { name: "ODUJEBE OLUWABUNMI AMINAT", division: "Sales", active: true, email: "salesmgr.cac@somotexnig.com", title: "Sales Manager" },
  { name: "ODUNAYO KOMOLAFE", division: "Sales", active: false },
  { name: "OGBA AFOKEOGHENE NDIDI", division: "Others", active: false },
  { name: "Okeke Lynda", division: "Others", active: false },
  { name: "OKPALA  AFAM PETER", division: "Others", active: false },
  { name: "OLANREWAJU OLAWUNMI", division: "Others", active: false },
  { name: "OLUSOLA KOWE ( LAGOS CEHA)", division: "Others", active: false },
  { name: "Otuyo Moriamo", division: "Others", active: false },
  { name: "RAHUL SHUKLA", division: "Service", active: false },
  { name: "Rajan Vaidya", division: "Others", active: false },
  { name: "Samuel Talabi", division: "Others", active: false },
  { name: "SHALOM METIBOBA", division: "Sales", active: false },
  { name: "STEPHEN OBADAH OLORUNFEMI", division: "Others", active: false },
  { name: "TOM INIOBONG ESSIEN", division: "Others", active: false },
  { name: "UDOH ABISOLA", division: "Sales", active: true, email: "abisola.udoh@somotexnig.com", title: "Sales Manager" },
  { name: "VICTOR AMOS ALU", division: "Others", active: false },
  { name: "VIKRANT KHETWANI", division: "Others", active: false },
  { name: "VINOD KHATWANI", division: "Others", active: false },
  { name: "YETUNDE ABDULKAREEM", division: "Others", active: false },
  { name: "YETUNDE OLAMIDE AJAYI", division: "Others", active: false },
  { name: "YOUSUF QURESHI M", division: "Retail", active: false },
];

export function normalizeSalesmanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

const ROSTER_BY_NORMALIZED_NAME = new Map(
  SALES_REGISTER_ROSTER.map((entry) => [normalizeSalesmanName(entry.name), entry])
);

export function lookupRosterEntry(salesmanName: string): RosterEntry | undefined {
  return ROSTER_BY_NORMALIZED_NAME.get(normalizeSalesmanName(salesmanName));
}
