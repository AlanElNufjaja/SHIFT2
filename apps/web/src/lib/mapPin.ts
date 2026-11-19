import L from 'leaflet';

export const parcelPinIcon = L.divIcon({
  className: 'fieldshift-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42" fill="none">
    <path d="M17 1C8.716 1 2 7.716 2 16c0 10.6 15 24.5 15 24.5S32 26.6 32 16C32 7.716 25.284 1 17 1z" fill="#15803D" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="17" cy="16" r="5.5" fill="#FFFFFF"/>
  </svg>`,
  iconSize: [34, 42],
  iconAnchor: [17, 41],
  popupAnchor: [0, -36],
});
