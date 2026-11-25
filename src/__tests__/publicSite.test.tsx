import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { AppStoreProvider } from '../context/AppStoreContext';

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppStoreProvider>
        <AppRoutes />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

function signInCustomerOnPage(name = 'Clarisse Customer') {
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}

describe('RJ HUB Printing public website (customer-only, zero admin routes or demo records)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('redirects /admin/* away from public site and keeps admin links absent from nav and footer', () => {
    renderAt('/admin/dashboard');
    expect(screen.getByRole('heading', { name: /your ideas, printed your way/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByText('Direct Access')).toBeInTheDocument();
  });

  it('allows customer sign-in on /login without Google label clutter and opens Terms modal', () => {
    renderAt('/login');

    expect(screen.getByRole('link', { name: /^back$/i })).toBeInTheDocument();
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^terms$/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /terms of service/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));

    signInCustomerOnPage('Clarisse Google');
    fireEvent.click(screen.getByRole('button', { name: /add a review/i }));
    expect(screen.getByLabelText(/your name/i)).toHaveValue('Clarisse Google');
  });

  it('opens Favorites drawer without images, updates quantity, and attaches photo when starting chat', async () => {
    renderAt('/login');
    signInCustomerOnPage('Clarisse Buyer');
    fireEvent.click(screen.getAllByRole('link', { name: /^services$/i })[0]!);

    fireEvent.click(screen.getByRole('button', { name: /add refrigerator magnets to favorites/i }));
    fireEvent.click(screen.getByRole('button', { name: /favorite services \(1\)/i }));

    const favoritesRegion = screen.getByRole('dialog', { name: /saved favorite services/i });
    expect(within(favoritesRegion).queryByRole('img')).not.toBeInTheDocument();
    expect(within(favoritesRegion).getByText('Refrigerator Magnets')).toBeInTheDocument();

    fireEvent.click(
      within(favoritesRegion).getByRole('button', {
        name: /increase quantity for refrigerator magnets/i,
      }),
    );
    expect(within(favoritesRegion).getByText('2 pcs')).toBeInTheDocument();

    fireEvent.click(within(favoritesRegion).getByRole('button', { name: /start inquiry chat/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your message...')).toHaveValue(
        'Favorites Inquiry (2 pcs):\n• Refrigerator Magnets × 2 (₱35 – ₱95 / pcs)',
      );
      expect(screen.getByAltText('Pending upload')).toHaveAttribute(
        'src',
        '/services/refrigerator-magnets.jpg',
      );
    });
  });

  it('runs Pacdora Help Center chat, bot typing, sending indicator, and resets on sign-out', async () => {
    renderAt('/login');
    signInCustomerOnPage('Bianca Navarro');

    fireEvent.click(screen.getByRole('button', { name: /open inquiry chat/i }));
    expect(screen.getByText('RJ Print HUB Help Center')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /send us a message/i }));

    expect(screen.getAllByAltText('RJ Print HUB').length).toBeGreaterThan(1);
    expect(screen.getAllByText('RJ Print HUB Bot Auto Reply').length).toBeGreaterThan(0);

    fireEvent.click(
      within(screen.getByRole('group', { name: /quick-reply options/i })).getByRole('button', {
        name: /choose item, price & reservation/i,
      }),
    );
    const mugPill = within(screen.getByRole('group', { name: /quick-reply options/i })).getByRole(
      'button',
      { name: /mug customization/i },
    );
    fireEvent.click(mugPill);

    const chatInput = screen.getByPlaceholderText('Enter your message...');
    fireEvent.click(
      within(screen.getByRole('group', { name: /quick-reply options/i })).getByRole('button', {
        name: /add my ph phone number/i,
      }),
    );
    fireEvent.change(chatInput, { target: { value: '09171234567' } });
    fireEvent.click(screen.getByRole('button', { name: /^send message$/i }));

    fireEvent.click(
      within(screen.getByRole('group', { name: /quick-reply options/i })).getByRole('button', {
        name: /add order details/i,
      }),
    );
    fireEvent.change(chatInput, {
      target: { value: 'Need 12 personalized white ceramic mugs with names.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send message$/i }));

    await waitFor(() => {
      expect(screen.getByText(/is now with our rj print hub admin team/i)).toBeInTheDocument();
      expect(screen.getByText('Delivered')).toBeInTheDocument();
    });

    fireEvent.change(chatInput, { target: { value: 'Can we pick up on Friday?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send message$/i }));
    expect(screen.getByText('Sending...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Delivered').length).toBe(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /open profile/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(screen.queryByRole('dialog', { name: /chat with rj print hub/i })).not.toBeInTheDocument();
  });

  it('validates Contact numbers-only, max 11 digits, and @ email format', () => {
    renderAt('/contact');
    const phoneInput = screen.getByLabelText(/phone number/i);
    const emailInput = screen.getByLabelText(/email address/i);

    fireEvent.change(phoneInput, { target: { value: 'abc!' } });
    expect(
      screen.getByText(/numbers only \(0–9\) — letters and special characters are not allowed/i),
    ).toBeInTheDocument();

    fireEvent.change(phoneInput, { target: { value: '091712345678' } });
    expect(screen.getByText(/phone number cannot exceed 11 digits/i)).toBeInTheDocument();

    fireEvent.change(emailInput, { target: { value: 'clarisseexample.com' } });
    expect(screen.getByText(/email address must include '@'/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Clarisse Mendoza' } });
    fireEvent.change(phoneInput, { target: { value: '09171234567' } });
    fireEvent.change(emailInput, { target: { value: 'clarisse@example.com' } });
    fireEvent.change(screen.getByLabelText(/leave us a message/i), {
      target: { value: 'Can I inquire about pricing for 50 calling cards?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByRole('heading', { name: /message sent/i })).toBeInTheDocument();
  });

  it('gates services, studio customization, and chat behind Sign-In prompt card for signed-out guests', () => {
    renderAt('/services');

    fireEvent.click(screen.getByRole('button', { name: /add lamination to favorites/i }));
    expect(screen.getByRole('dialog', { name: /sign in to rj print hub with google/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close sign-in prompt/i }));

    fireEvent.click(screen.getByRole('button', { name: /send to inquiry chat/i }));
    expect(screen.getByRole('dialog', { name: /sign in to rj print hub with google/i })).toBeInTheDocument();
  });

  it('renders Customization Studio with Horizontal/Vertical X/Y controls when signed in', async () => {
    renderAt('/login');
    signInCustomerOnPage('Studio Tester');
    fireEvent.click(screen.getAllByRole('link', { name: /^services$/i })[0]!);

    expect(screen.getByRole('heading', { name: /customization studio/i })).toBeInTheDocument();
    expect(screen.getByText('Pick an item, choose size and print finish, then send to chat.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^horizontal$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^vertical$/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/add text/i), { target: { value: 'RJ HUB' } });
    fireEvent.click(screen.getByRole('button', { name: /send to inquiry chat/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter your message...')).toHaveValue(
        '3D Customizer Draft — Lamination (Size: A4 Laminate (210 × 297 mm · 250 mic) · Text: "RJ HUB" · Font: Inter 18pt · Glossy film). Ready for review.',
      );
    });
  });
});
