import './globals.css'

export const metadata = {
  title: 'Chennai NET Academy',
  description: 'UGC-NET Exam Preparation',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
