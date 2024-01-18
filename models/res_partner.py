# Copyright 2021 Camptocamp SA - Iván Todorovich
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import api, models , fields


class ResPartner(models.Model):
    _inherit = "res.partner"

    @api.model
    def create_from_ui(self, partner):
        # The core method sets the partner language to be the same
        # as the current user language. Unfortunately there isn't a cleaner
        # way to do this, so we change the lang after the partner is created.
        # We have to catch the partner dict lang before super() changes it.
        lang = partner.get("lang")
        partner_id = super().create_from_ui(partner)
        if lang:
            partner = self.browse(partner_id)
            if partner.lang != lang:
                partner.lang = lang
        return partner_id

    
class Room(models.Model):
    _name = 'room.room'
    _description = 'Room'

    name = fields.Char('Room Name', required=True)
    location = fields.Char('Location')

class PosOrderExtension(models.Model):
    _inherit = 'pos.order'

    room_id = fields.Many2one('room.room', string='Room')

class PosConfig(models.Model):
    _inherit = 'pos.config'

    room_ids = fields.Many2many('room.room', string='Rooms')

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    room_id = fields.Many2one('room.room', string='Room')

class ProductTemplate(models.Model):
    _inherit = 'product.template'
    
    type_hotel = fields.Selection(
        string='Type Hotel',
        selection=[
            ('standard', 'Standard Room'),
            ('superior', 'Superior Room'),
            ('deluxe', 'Deluxe Room')
        ]
    )
     
