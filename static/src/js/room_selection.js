odoo.define('point_of_sale.FavoriteProductScreen', function (require) {
    "use strict";

var PosBaseWidget = require('point_of_sale.BaseWidget');
var gui = require('point_of_sale.gui');
var models = require('point_of_sale.models');
var core = require('web.core');
var rpc = require('web.rpc');
var utils = require('web.utils');
var field_utils = require('web.field_utils');
var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;
var Printer = require('point_of_sale.Printer').Printer;

// Variabale yang wajib di tambahkan
var ScreenWidget = PosBaseWidget.extend({

    init: function(parent,options){
        this._super(parent,options);
        this.hidden = false;
    },

    barcode_product_screen:         'products',     //if defined, this screen will be loaded when a product is scanned

    // what happens when a product is scanned : 
    // it will add the product to the order and go to barcode_product_screen. 
    barcode_product_action: function(code){
        var self = this;
        if (self.pos.scan_product(code)) {
            if (self.barcode_product_screen) {
                self.gui.show_screen(self.barcode_product_screen, null, null, true);
            }
        } else {
            this.barcode_error_action(code);
        }
    },
    
    // what happens when a client id barcode is scanned.
    // the default behavior is the following : 
    // - if there's a user with a matching barcode, put it as the active 'client' and return true
    // - else : return false. 
    barcode_client_action: function(code){
        var partner = this.pos.db.get_partner_by_barcode(code.code);
        if(partner){
            if (this.pos.get_order().get_client() !== partner) {
                this.pos.get_order().set_client(partner);
                this.pos.get_order().set_pricelist(_.findWhere(this.pos.pricelists, {'id': partner.property_product_pricelist[0]}) || this.pos.default_pricelist);
            }
            return true;
        }
        this.barcode_error_action(code);
        return false;
    },
    
    // what happens when a discount barcode is scanned : the default behavior
    // is to set the discount on the last order.
    barcode_discount_action: function(code){
        var last_orderline = this.pos.get_order().get_last_orderline();
        if(last_orderline){
            last_orderline.set_discount(code.value);
        }
    },
    // What happens when an invalid barcode is scanned : shows an error popup.
    barcode_error_action: function(code) {
        var show_code;
        if (code.code.length > 32) {
            show_code = code.code.substring(0,29)+'...';
        } else {
            show_code = code.code;
        }
        this.gui.show_popup('error-barcode',show_code);
    },

    // this method shows the screen and sets up all the widget related to this screen. Extend this method
    // if you want to alter the behavior of the screen.
    show: function(){
        var self = this;

        this.hidden = false;
        if(this.$el){
            this.$el.removeClass('oe_hidden');
        }

        this.pos.barcode_reader.set_action_callback({
            'product': _.bind(self.barcode_product_action, self),
            'weight': _.bind(self.barcode_product_action, self),
            'price': _.bind(self.barcode_product_action, self),
            'client' : _.bind(self.barcode_client_action, self),
            'discount': _.bind(self.barcode_discount_action, self),
            'error'   : _.bind(self.barcode_error_action, self),
        });
    },

    // this method is called when the screen is closed to make place for a new screen. this is a good place
    // to put your cleanup stuff as it is guaranteed that for each show() there is one and only one close()
    close: function(){
        if(this.pos.barcode_reader){
            this.pos.barcode_reader.reset_action_callbacks();
        }

        if(this.payment_interface){
            this.payment_interface.close();
        }
    },

    // this methods hides the screen. It's not a good place to put your cleanup stuff as it is called on the
    // POS initialization.
    hide: function(){
        this.hidden = true;
        if(this.$el){
            this.$el.addClass('oe_hidden');
        }
    },

    // we need this because some screens re-render themselves when they are hidden
    // (due to some events, or magic, or both...)  we must make sure they remain hidden.
    // the good solution would probably be to make them not re-render themselves when they
    // are hidden. 
    renderElement: function(){
        this._super();
        if(this.hidden){
            if(this.$el){
                this.$el.addClass('oe_hidden');
            }
        }
    },
    /**
     * Handles the error response from the server when we push
     * an invoiceable order
     * Displays appropriates warnings and errors and
     * proposes subsequent actions
     *
     * @private
     * @param {PosModel} order: the order to consider, defaults to current order
     * @param {Boolean} refresh_screens: whether or not displayed screens should refresh
     * @param {Object} error: the error provided by Ajax
     */
    _handleFailedPushForInvoice: function (order, refresh_screen, error) {
        var self = this;
        order = order || this.pos.get_order();
        this.invoicing = false;
        order.finalized = false;
        if (error.message === 'Missing Customer') {
            this.gui.show_popup('confirm',{
                'title': _t('Please select the Customer'),
                'body': _t('You need to select the customer before you can invoice an order.'),
                confirm: function(){
                    self.gui.show_screen('clientlist', null, refresh_screen);
                },
            });
        } else if (error.message === 'Backend Invoice') {
            this.gui.show_popup('confirm',{
                'title': _t('Please print the invoice from the backend'),
                'body': _t('The order has been synchronized earlier. Please make the invoice from the backend for the order: ') + error.data.order.name,
                confirm: function () {
                    this.gui.show_screen('receipt', null, refresh_screen);
                },
                cancel: function () {
                    this.gui.show_screen('receipt', null, refresh_screen);
                },
            });
        } else if (error.code < 0) {        // XmlHttpRequest Errors
            this.gui.show_popup('error',{
                'title': _t('The order could not be sent'),
                'body': _t('Check your internet connection and try again.'),
                cancel: function () {
                    this.gui.show_screen('receipt', {button_print_invoice: true}, refresh_screen); // refresh if necessary
                },
            });
        } else if (error.code === 200) {    // OpenERP Server Errors
            this.gui.show_popup('error-traceback',{
                'title': error.data.message || _t("Server Error"),
                'body': error.data.debug || _t('The server encountered an error while receiving your order.'),
            });
        } else {                            // ???
            this.gui.show_popup('error',{
                'title': _t("Unknown Error"),
                'body':  _t("The order could not be sent to the server due to an unknown error"),
            });
        }
    },
});

var FavoriteProductScreen = ScreenWidget.extend({
    template: 'FavoriteProductScreen',

    setup(){
        super.setup()
        console.log("New FavoriteProductScreen")
    }

});
gui.define_screen({name:'FavoriteProductScreen', widget: FavoriteProductScreen});

return {
    FavoriteProductScreen: FavoriteProductScreen,
};

});
