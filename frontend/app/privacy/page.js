import LegalPage, { LegalSection } from "../../components/LegalPage";

export const metadata = {
  title: "Privacy policy — CipherSwitch",
  description: "What CipherSwitch stores, and what it never receives.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="This notice explains what CipherSwitch handles when you use the service. It is written for the product as it works today."
    >
      <LegalSection title="What never reaches the server">
        <p>
          Your passphrase, the readable title, and the readable message are
          encrypted in your browser. They are not sent to the server, and they
          are not included in email. If the passphrase is lost, the message
          cannot be restored from the stored ciphertext.
        </p>
      </LegalSection>
      <LegalSection title="What the server stores">
        <p>When you create a vault, the service stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the encrypted title and encrypted message, plus the salt, initialization vectors, and integrity check</li>
          <li>the owner email address and each recipient’s email address and role</li>
          <li>SHA-256 hashes of the check-in token, the dashboard token, and any unlock token</li>
          <li>schedule details such as the check-in interval, grace period, travel window, release time, template name, and whether the vault is a dry run</li>
          <li>status, including when it was created, last checked in, or triggered</li>
        </ul>
        <p>
          The raw tokens are shown to you and emailed so you can use the links.
          The database keeps the hashes, not the tokens themselves.
        </p>
      </LegalSection>
      <LegalSection title="Why this data is used">
        <p>The service uses that information to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>keep the vault and show it on the dashboard that matches your access token</li>
          <li>send check-in, reminder, release, and witness emails</li>
          <li>decide when a vault enters a grace period or triggers</li>
          <li>refuse an unlock until the vault has triggered and any release delay has passed</li>
          <li>operate, secure, and debug the service</li>
        </ul>
        <p>
          Email addresses are used because you asked the service to contact
          those people about that vault. The service does not sell personal
          information and does not use it for advertising.
        </p>
      </LegalSection>
      <LegalSection title="Email delivery">
        <p>
          Transactional email is sent through Resend when an API key is
          configured. Resend receives the recipient address, the subject, and
          the message, which includes vault links. Resend’s own terms and
          privacy notice apply to that delivery. If no email key is configured,
          those messages are not sent.
        </p>
      </LegalSection>
      <LegalSection title="Links, logs, and this browser">
        <p>
          Check-in, unlock, and dashboard tokens are placed in the address
          hash, which browsers do not send to the server with the page request.
          The token is sent only when you submit it, for example to check in or
          to unlock. Server logs can include an email address when a message is
          sent, and they can include ordinary request data needed to run the
          API.
        </p>
        <p>
          Accessibility choices are saved in local storage on your device under
          the key <span className="font-mono text-ink">cipherswitch-a11y</span>.
          They are not sent to the server. The site does not set advertising
          cookies and does not run a third-party analytics tracker.
        </p>
      </LegalSection>
      <LegalSection title="How long it is kept">
        <p>
          Vault records stay until the operator of this deployment deletes them.
          This copy of the site does not yet include a self-serve delete
          button. A request to delete a vault has to go to that operator, who
          can remove the row from the database they control. Deletion removes
          the ciphertext and the stored email addresses for that vault. It
          cannot erase copies already delivered to a recipient’s inbox.
        </p>
      </LegalSection>
      <LegalSection title="Who it is shared with">
        <p>
          Data is shared with the email provider when email is enabled, and
          with people you named when the service sends them a link or a notice.
          It can also be shared if the law requires the operator to disclose it.
          The operator does not otherwise hand the vault database to other
          companies.
        </p>
      </LegalSection>
      <LegalSection title="Children">
        <p>
          CipherSwitch is for adults. It is not directed at anyone under 18,
          and it should not be used to collect information about a child.
        </p>
      </LegalSection>
      <LegalSection title="Your choices">
        <p>
          You can stop using the service, stop checking in, and avoid sending
          further email addresses. Depending on where you live, you may have
          rights to access, correct, or delete personal information, or to
          object to certain uses. Those requests are made to the operator of
          the CipherSwitch deployment you used, because this software does not
          publish a separate company address.
        </p>
        <p>
          Where the European data-protection rules apply, the operator of that
          deployment is the controller of the owner and recipient email
          addresses and of the vault records. The legal bases relied on are
          the steps you asked the service to take before a contract is in
          place, the contract formed by these terms, and the operator’s
          legitimate interest in keeping the service secure and running.
        </p>
      </LegalSection>
      <LegalSection title="Changes">
        <p>
          If this notice changes, the updated version will replace this page
          and the date at the top will change.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
