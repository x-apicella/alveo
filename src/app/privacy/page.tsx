import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Alveo",
  description: "How Alveo handles accounts, messages, voice, video, screen sharing, and your privacy choices.",
  alternates: { canonical: "https://alveo.chat/privacy" },
};

const sections: [string, string[]][] = [
  [
    "Who we are and what this covers",
    [
      "Alveo is an independently operated communication service at alveo.chat for text chat, voice, video, and sharing screens, games, and application audio. Alveo is operated by Xander Apicella. In this policy, “we” means Xander Apicella as the operator of Alveo. It covers the current website and explains how we will approach planned features. A roadmap item is not a statement that we already collect that information.",
      "Privacy contact: Xander Apicella, xapicella7@gmail.com. Contact us privately about this policy or to request access, correction, export, or deletion of your information."
    ]
  ],
  [
    "Accounts and sign-in",
    [
      "We process your account identifier, display name, profile image if provided, and account creation time. Our authentication service, Neon Auth, also processes information needed for sign-in, including your email address, authentication records, and session information. If you use email and password, your credentials are handled through Neon Auth; do not send us your password in a support request.",
      "Google sign-in is optional. When you choose it, Google shares basic identity information through the email, profile, and openid permissions, such as your name, email, profile image, and a unique identifier. We use this to authenticate you and display your profile. We do not request access to Gmail, Drive, contacts, or your Google password. Where enabled, a connected D&D account can provide an identifier, name, and optional profile image for single sign-on."
    ]
  ],
  [
    "Messages and community information",
    [
      "We store the messages you send, their author, channel and timestamps; server and channel names; server ownership; memberships and join times; and invitation codes. This information supports shared conversations, history, and access to your communities.",
      "Your display identity and contributions are visible to other members with access. The current service uses server membership to control channel access; do not assume individual channels are private from other members. People with a valid invite can join and may see existing message history. Share invitations carefully. Information you send to us for support or a privacy request is also processed to respond."
    ]
  ],
  [
    "Voice, video, screens, and application audio",
    [
      "When you join voice, Alveo requests microphone access and can publish microphone audio using your device permissions. Camera and screen or audio sharing use the sources you enable. Your browser or operating system controls available capture options and permissions. You can mute, turn off your camera, stop each share, leave the room, or revoke permissions.",
      "Live audio and video are transmitted through our media infrastructure to participants in the room. Sharing a screen, window, tab, or system audio can expose notifications, private conversations, other people’s voices, and anything else included in the selected source. Check what is visible and audible before sharing. Alveo does not otherwise read arbitrary files on your machine.",
      "We do not currently operate server-side recording, replay archives, transcription, or AI analysis of calls or streams. Live media is processed and temporarily buffered to deliver the session rather than intentionally saved as a recording. Room, participant, track, connection, and error metadata may appear in operational state or logs. Other participants can independently record, copy, or redistribute what they receive; we cannot prevent that."
    ]
  ],
  [
    "Technical information and cookies",
    [
      "Our hosting, authentication, database, and media systems process technical information needed to deliver and protect the service. This can include IP addresses, request times and routes, browser or device information, session and room identifiers, connection failures, and media connection statistics. We use it for authentication, troubleshooting, reliability, and security.",
      "We use essential cookies and related session mechanisms to keep you signed in and complete authentication. The Alveo single-sign-on session cookie can last up to 30 days; Neon and Google manage their own authentication cookie lifetimes. Blocking or clearing these cookies may sign you out or prevent login. Browser or SDK storage may also remember device and interface preferences.",
      "We do not currently use advertising cookies, advertising pixels, or third-party marketing analytics. We do not sell personal information or share it for cross-context behavioral advertising. We do not use your conversations or streams to train AI models. We do not change our practices in response to a browser Do Not Track signal."
    ]
  ],
  [
    "Why we use information",
    [
      "We use information to create and authenticate accounts, provide chat and live media, maintain memberships and invitations, deliver message history, respond to requests, diagnose failures, protect the service from misuse, and meet applicable legal obligations. We do not use your Google identity data for unrelated advertising.",
      "Where applicable data-protection law requires a legal basis, we rely on providing the service you request, legitimate interests in operating and securing it where those interests are not overridden by your rights, compliance with legal obligations, and consent where required. You can withdraw consent for optional processing without affecting earlier lawful processing. Device permission is a capture control and does not replace any legally required notice or consent."
    ]
  ],
  [
    "Who receives information",
    [
      "Other users receive the messages and media you share in spaces they can access. Authorized Alveo operators may access stored information and operational records when needed to operate the service, troubleshoot, handle requests, or investigate misuse.",
      "Our current infrastructure uses OVHcloud for the application, self-hosted LiveKit media and relay services, and server backups; Neon for the database and authentication; Google for optional Google sign-in; and Porkbun for domain registration and DNS. These providers process information relevant to their roles, such as hosted data, authentication information, network traffic, or DNS queries. Using LiveKit software on our VPS does not mean your streams are currently hosted by LiveKit Cloud.",
      "Providers may use their own subprocessors and process certain service or security information under their own policies. Google’s handling of your Google account is governed by its privacy policy. We may disclose relevant information if reasonably necessary to comply with applicable law or valid legal process, protect people or the service, or address fraud and security incidents. If operation of Alveo is transferred, information may transfer with it subject to applicable law and notice of material changes."
    ]
  ],
  [
    "Storage, retention, and security",
    [
      "The current application and media server are in the United States, and our Neon database and authentication deployment are in a US region. Providers and their support or subprocessors may process information elsewhere. Data-protection rules may differ from those where you live; where legally required, applicable safeguards must be used for international transfers.",
      "Accounts, memberships, and message history currently have no automatic age-based deletion schedule. They remain until removed through an administrative process or a future deletion feature. We retain operational information as needed for reliability, security, and investigations; log rotation is based on storage size rather than a guaranteed number of days. Backups and database recovery systems may retain earlier copies until they expire under the relevant provider’s configured recovery cycle. Deleting active data does not necessarily erase backup copies immediately.",
      "We use HTTPS, encrypted media transport, authentication, access checks, and restricted administrative access. The current service does not enable end-to-end encryption: stored messages and media passing through the server are not protected from the service operator by end-to-end encryption. No system is completely secure. Do not use Alveo to transmit secrets or sensitive information that you cannot risk exposing."
    ]
  ],
  [
    "Your choices and privacy requests",
    [
      "You can choose whether to use Google sign-in, stop sending messages, disable media, revoke device permissions, and sign out. You can also revoke Alveo’s Google connection in your Google account settings. Revoking Google access does not itself delete information already stored in Alveo.",
      "Contact the privacy address above to request a copy, correction, or deletion of your account or content. Self-service account deletion and export are not currently available in the Alveo interface. We may ask for proportionate information to verify that the account is yours, and we will respond within the time required by applicable law. Never send passwords, session cookies, or identity documents unless a specific, necessary verification process has been agreed.",
      "Deletion may require handling server ownership and shared message history. We will explain any information that must be retained for legal obligations, security, or other lawful reasons. We cannot delete copies independently made by other users. Depending on your location and applicable law, you may also have rights to restrict or object to processing, receive portable data, withdraw consent, appeal a decision, or complain to a data-protection authority. We do not penalize you for exercising applicable privacy rights."
    ]
  ],
  [
    "Children",
    [
      "Alveo is not intended for children under 13, or anyone below the minimum age required to use the service in their jurisdiction without parental authorization. We do not knowingly collect personal information from children under 13. If you believe a child has provided information, contact us so we can investigate and take appropriate action, including deletion."
    ]
  ],
  [
    "Planned features and policy updates",
    [
      "Our roadmap includes desktop clients with application-specific video and audio capture, additional streaming controls, external encoders such as OBS, richer messaging and community tools, permissions and moderation, and improved diagnostics. These are not all available today. Depending on what ships, they may involve selected application or device metadata, attachments and message interactions, moderation records, or additional connection diagnostics.",
      "Before introducing materially different data collection or use, we will update this policy and provide relevant in-product explanations and controls. Recording, transcription, AI processing, billing, advertising, or a new hosting provider would require a fresh assessment and disclosure before use; this policy does not authorize undisclosed collection just because a feature might be developed. We will obtain consent where required.",
      "The effective date above identifies this version. Material changes will be announced through the site or another appropriate channel."
    ]
  ]
];

export default function PrivacyPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10">
      <article className="mx-auto max-w-3xl text-base leading-7">
        <Link href="/" className="underline underline-offset-4">Back to Alveo</Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 opacity-70">Effective September 13, 2026</p>
        <p className="mt-6">Your conversations are the reason Alveo exists. This policy explains what information the service uses, who can receive it, and what control you have.</p>
        <p className="mt-3">Privacy questions: <a href="mailto:xapicella7@gmail.com" className="underline underline-offset-4">xapicella7@gmail.com</a></p>
        {sections.map(([title, paragraphs]) => (
          <section key={title} className="mt-9">
            <h2 className="text-xl font-semibold">{title}</h2>
            {paragraphs.map((paragraph) => <p key={paragraph} className="mt-3">{paragraph}</p>)}
          </section>
        ))}
      </article>
    </main>
  );
}
