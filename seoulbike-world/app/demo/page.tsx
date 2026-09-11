import type { Metadata } from 'next';
import { ArrowLeft, ArrowUpRight, Bike, Download, Play } from 'lucide-react';
import styles from './demo.module.css';

export const metadata: Metadata = {
  title: 'SeoulBike World — Watch the demo',
  description:
    'A 20-second screen recording of changing conditions, city views and a full historical day.',
};

const chapters = [
  [
    '00:00',
    'Change the conditions',
    'Switch weather presets and see signed changes in estimated rentals.',
  ],
  [
    '00:04',
    'Calendar and availability',
    'Change holiday and service settings, then restore a busy commute.',
  ],
  [
    '00:07',
    'Choose a full day',
    'Run from midnight to midnight with recorded hourly conditions.',
  ],
  [
    '00:08',
    'Explore as time moves',
    'View the river and neighborhoods as the historical day advances.',
  ],
];

export default function DemoPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="SeoulBike World home">
          <span className={styles.brandMark}>
            <Bike size={25} />
          </span>
          <span>
            SeoulBike <span className={styles.brandLight}>World</span>
          </span>
        </a>
        <a className={styles.back} href="/">
          <ArrowLeft size={16} /> Explore the city
        </a>
      </header>
      <section className={styles.hero} aria-labelledby="demo-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            <Play size={14} /> A 20-SECOND SCREEN RECORDING
          </p>
          <h1 id="demo-title">See SeoulBike World in motion.</h1>
          <p className={styles.lede}>
            Change weather and calendar conditions, switch city views, and see
            moments from a completed 24-hour historical run.
          </p>
          <div className={styles.facts} aria-label="Video details">
            <span>20 seconds</span>
            <span>Screen recording</span>
            <span>Full-day playback</span>
          </div>
          <a
            className={styles.primary}
            href="/demo/seoulbike-world.mp4"
            download="seoulbike-world-screen-recording.mp4"
          >
            <Download size={18} /> Download the video
          </a>
          <p className={styles.note}>
            Recorded directly from the app, trimmed and accelerated into a
            short, silent clip.
          </p>
        </div>
        <figure className={styles.player}>
          <video
            controls
            playsInline
            preload="metadata"
            poster="/demo/cover.jpg"
            width="1912"
            height="958"
            aria-label="SeoulBike World 20-second screen recording"
            aria-describedby="recording-description"
          >
            <source src="/demo/seoulbike-world.mp4" type="video/mp4" />
            Your browser does not support inline video.{' '}
            <a href="/demo/seoulbike-world.mp4">Download the MP4.</a>
          </video>
          <figcaption>
            A city in motion. Built from recorded Seoul rental data.
          </figcaption>
        </figure>
      </section>
      <section className={styles.tour} aria-labelledby="tour-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>INSIDE THE DEMO</p>
            <h2 id="tour-title">From one river to a city of possibilities.</h2>
          </div>
          <a className={styles.back} href="/">
            Try it yourself <ArrowUpRight size={16} />
          </a>
        </div>
        <ol className={styles.chapters}>
          {chapters.map(([time, title, description]) => (
            <li key={time}>
              <span className={styles.time}>{time}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <details className={styles.transcript} id="recording-description">
          <summary>Recording description</summary>
          <p>
            The recording opens on the actual city. Rainy and snowy presets
            change the complete historical input bundle and display numeric
            differences in estimated rentals. The single-factor panel shows
            weather controls, a holiday override and service availability.
            Closing service sets new rentals to zero; the evening commute preset
            restores operating service and a higher estimate.
          </p>
          <p>
            A time range follows 24 recorded hours from September 4, 2018 at
            midnight to September 5 at midnight. The camera moves through the
            overview, river and Namsan views while hourly weather, daylight and
            rental estimates update. Selected moments are trimmed and
            accelerated; the final shot shows the completed state.
          </p>
          <p>
            The video is silent, with no added captions, graphics or music. Data
            comes from 2017–18; the city, docks and routes are illustrative.
          </p>
        </details>
      </section>
      <footer className={styles.footer}>
        <span>Seoul-inspired geography. Illustrative city and routes.</span>
        <span>
          Data:{' '}
          <a
            href="https://doi.org/10.24432/C5F62R"
            target="_blank"
            rel="noreferrer"
          >
            UCI Seoul Bike Sharing Demand
          </a>{' '}
          ·{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </span>
      </footer>
    </main>
  );
}
