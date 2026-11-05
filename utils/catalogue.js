export const serviceNames = [
  "Website Development",
  "E-commerce Development",
  "Custom Software & CRM Development",
  "Mobile App Development",
  "Digital Marketing & Meta Ads",
  "SEO & Google Business Profile",
  "Social Media Management",
  "Graphic Design & Branding",
  "Video Editing & Content Creation",
  "Photoshoot & Video Shoot",
  "AI Realistic Advertisement Videos",
  "UI/UX Design",
  "AI Automation Solutions",
];

export const defaultServices = () =>
  serviceNames.map((name, i) => ({
    id: "dixaz-service-" + (i + 1),
    code: String(2001 + i),
    name,
    description: "",
    price: null,
    unit: "Project",
    active: true,
    offerName: "",
    offerPrice: null,
    offerStart: "",
    offerEnd: "",
    history: [],
  }));

export const servicePrice = (s, date) =>
  s.offerPrice !== null && s.offerStart <= date && s.offerEnd >= date
    ? s.offerPrice
    : s.price;

