import { describe, expect, it } from 'vitest';
import { localRepository } from '../services/localRepository';

describe('localRepository', () => {
  it('creates a Pending inquiry, links or creates a customer, and allows replies and status updates', () => {
    const created = localRepository.createInquiry({
      customerName: 'Elena Cruz',
      contactInfo: 'elena.cruz@example.com',
      serviceId: 'laser-engraving',
      message: 'Asking about engraving 8 wooden plaques for our department awards.',
    });

    expect(created.status).toBe('Pending');
    expect(created.referenceCode).toMatch(/^RJH-\d{4}-\d{3}$/);
    expect(created.customerId).toBeTruthy();

    const { inquiry: replied } = localRepository.addInquiryReply(
      created.id,
      'Yes, we can engrave wooden plaques. Please share your crest layout.',
      undefined,
      'data:image/png;base64,ZmFrZQ==',
    );
    expect(replied.responses).toHaveLength(1);
    expect(replied.responses[0]?.senderRole).toBe('admin');
    expect(replied.responses[0]?.imageDataUrl).toBe('data:image/png;base64,ZmFrZQ==');
    expect(replied.status).toBe('Answered');

    const { inquiry: followUp } = localRepository.addCustomerMessage(
      created.id,
      'Can we send the vector crest file tonight?',
      'Elena Cruz',
      'data:image/png;base64,Y3VzdG9tZXI=',
    );
    expect(followUp.responses).toHaveLength(2);
    expect(followUp.responses[1]?.senderRole).toBe('customer');
    expect(followUp.responses[1]?.imageDataUrl).toBe('data:image/png;base64,Y3VzdG9tZXI=');
    expect(followUp.status).toBe('Pending');

    const completed = localRepository.updateInquiryStatus(created.id, 'Completed');
    expect(completed.status).toBe('Completed');

    const beforeCount = localRepository.listInquiries().length;
    const edited = localRepository.updateInquiry(created.id, {
      customerName: 'Elena Santos',
      contactInfo: '09171234567',
      email: 'elena.santos@example.com',
      serviceId: 'souvenir-making',
      message: 'Updated request: 10 boxed souvenir sets with plaques.',
    });
    expect(localRepository.listInquiries().length).toBe(beforeCount);
    expect(edited.customerNameSnapshot).toBe('Elena Santos');
    expect(edited.serviceId).toBe('souvenir-making');
    expect(edited.message).toBe('Updated request: 10 boxed souvenir sets with plaques.');
  });

  it('filters inquiries by customer name, message text, and status', () => {
    localRepository.createInquiry({
      customerName: 'Clarisse Mendoza',
      contactInfo: '09171234567',
      email: 'clarisse.mendoza@example.com',
      serviceId: 'souvenir-making',
      message: 'Need 45 recognition day souvenir sets with department emblem.',
    });
    const pendingMatches = localRepository.listInquiries({
      search: 'recognition day',
      status: 'Pending',
    });
    expect(pendingMatches.length).toBeGreaterThanOrEqual(1);
    expect(pendingMatches[0]?.customerNameSnapshot).toContain('Clarisse');
  });

  it('retains inquiry messages and customer identity when a client record is deleted', () => {
    const client = localRepository.createClient({
      fullName: 'Temporary Client',
      contactInfo: 'temp.client@example.com',
      notes: 'Initial note',
    });

    const inquiry = localRepository.createInquiry({
      customerName: 'Temporary Client',
      contactInfo: 'temp.client@example.com',
      serviceId: 'refrigerator-magnets',
      message: 'Inquiry for 30 square refrigerator magnets with event date.',
    });

    expect(inquiry.customerId).toBe(client.id);

    const outcome = localRepository.deleteClient(client.id);
    expect(outcome.archivedInquiryCount).toBe(1);
    expect(localRepository.getClientById(client.id)).toBeUndefined();

    const retained = localRepository.getInquiryById(inquiry.id);
    expect(retained).toBeDefined();
    expect(retained?.customerId).toBeNull();
    expect(retained?.customerNameSnapshot).toBe('Temporary Client');
    expect(retained?.customerContactSnapshot).toBe('temp.client@example.com');
  });
});
