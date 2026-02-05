export default function ImdbIcon({ className }) {
  return (
    <svg
      viewBox="0 0 48 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="48" height="24" rx="4" fill="#F5C518" />
      <text
        x="24"
        y="17"
        fill="#000000"
        fontFamily="Impact, Arial, sans-serif"
        fontSize="14"
        fontWeight="900"
        textAnchor="middle"
      >
        IMDb
      </text>
    </svg>
  );
}
