import { eClasses } from './../../constants/eClasses';
import { eAngularEvents, eEvents } from './../../constants/eEvents';
import { eSvgIcon } from './../../constants/eSvgIcon';
import { keys } from './../../constants/keys';
import { Box, BOXLEVEL_FULL, BOXLEVEL_NEARFULL, eBoxId } from './../../definitions/consumables/box';
import { Cartridge, CARTRIDGELEVEL_EMPTY, CARTRIDGELEVEL_NEAREMPTY, eCartridgeId } from './../../definitions/consumables/cartridge';
import { Ink } from './../../definitions/consumables/ink';
import { DeviceInfo } from './../../definitions/deviceInfo';
import { eEnvelopeFusingUnit } from './../../definitions/installableOption';
import { Job } from './../../definitions/job/job';
import { eJobStatus, jobStatusMap } from './../../definitions/jobStatus';
import { eLevelPrinterStatus } from './../../definitions/printerStatus/levelPrinterStatus';
import { eMainPrinterStatus } from './../../definitions/printerStatus/mainPrinterStatus';
import { PrinterStatus } from './../../definitions/printerStatus/printerStatus';
import { eMediaColor } from './../../definitions/printFeatures/paperFeatures';
import { PAPERPROFILE_NOSET } from './../../definitions/printFeatures/paperProfileFeatures';
import { Tray } from './../../definitions/tray/tray';
import { getTableData, ITableData, ITableDataCell, ITableDataHeader, ITableHeaderDef, ITableRow } from './../../directives/sh-table';
import { localizeFilter_t } from './../../filters/localize';
import { DebugSrv } from './../../services/debugSrv';
import { DeviceSrv } from './../../services/deviceSrv';
import { JobSrv } from './../../services/jobSrv';
import { ListsSrv } from './../../services/listsSrv';
import { getLangSensitiveFormattedNumber } from './../../services/numberFormat';
import { ProductionSrv } from './../../services/productionSrv';
import { UnitsSrv } from './../../services/unitsSrv';
import { eBottomZoneStatus } from './../shBottomZone/shBottomZone';
import { eScrollPosition } from './../shScroll/shScroll';


enum eConsumableStatus
{
    ready,
    warning,
    error
}

export enum eTableTraysColumns
{
    id,
    paperSize,
    paperAmount,
    paperColor,
    paperType,
    paperWeight,
    paperWeightUnit,
    paperProfile,
    feedDirection,
    prepunched,
    paperProfileId
}
const tableTraysHeaderDefs: { [id:  number]: ITableHeaderDef } = {};
tableTraysHeaderDefs[eTableTraysColumns.id]              = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_ID,              width: 96,  className: 'id' };
tableTraysHeaderDefs[eTableTraysColumns.paperSize]       = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERSIZE,       width: 96,  className: 'size' };
tableTraysHeaderDefs[eTableTraysColumns.paperAmount]     = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERAMOUNT,     width: 96,  className: 'amount' };
tableTraysHeaderDefs[eTableTraysColumns.paperColor]      = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERCOLOR,      width: 108, className: 'color' };
tableTraysHeaderDefs[eTableTraysColumns.paperType]       = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERTYPE,       width: 84,  className: 'type' };
tableTraysHeaderDefs[eTableTraysColumns.paperWeight]     = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERWEIGHT,     width: 108, className: 'weight' };
tableTraysHeaderDefs[eTableTraysColumns.paperWeightUnit] = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERWEIGHTUNIT, width: 84,  className: 'unit' };
tableTraysHeaderDefs[eTableTraysColumns.paperProfile]    = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PAPERPROFILE,    width: -1,  className: 'profile' };
tableTraysHeaderDefs[eTableTraysColumns.feedDirection]   = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_FEEDDIRECTION,   width: 96,  className: 'feeddirection' };
tableTraysHeaderDefs[eTableTraysColumns.prepunched]      = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_PREPUNCHED,      width: 96,  className: 'icon' };
tableTraysHeaderDefs[eTableTraysColumns.paperProfileId]  = { l10n: keys.L10N_ACTIVITYBAR_TRAYS_COLUMN_NUMBER,          width: 42,  className: 'number' };

export class ShActivityBarCtrl implements ng.IComponentController
{
    private barStatus:        eBottomZoneStatus;
    private consumableRows:   [ Box | Cartridge, Box | Cartridge | undefined ][] = [];
    private deviceInfo:       DeviceInfo;
    private onStatusBtnClick: () => void;
    private scrollingDownConsumables:        boolean = false;
    private scrollingDownConsumablesEnabled: boolean = true;
    private scrollingDownStatus:             boolean = false;
    private scrollingDownStatusEnabled:      boolean = true;
    private scrollingUpConsumables:          boolean = false;
    private scrollingUpConsumablesEnabled:   boolean = true;
    private scrollingUpStatus:               boolean = false;
    private scrollingUpStatusEnabled:        boolean = true;
    private tableTraysColumns:               eTableTraysColumns[];
    private tableTraysSortColumn:            eTableTraysColumns;
    private tableTraysSortReversed:          boolean;

    public tableTrays: ITableData<Tray>;

    static $inject = ['$document', '$scope',
        'localizeFilter', 'orderByFilter',
        'debugSrv', 'deviceSrv', 'jobSrv', 'listsSrv', 'productionSrv', 'unitsSrv'];
    constructor(private $document:      JQuery,
                private $scope:         ng.IScope,
                private localizeFilter: localizeFilter_t,
                private orderByFilter:  ng.IFilterOrderBy,
                private debugSrv:       DebugSrv,
                private deviceSrv:      DeviceSrv,
                private jobSrv:         JobSrv,
                private listsSrv:       ListsSrv<any>,
                private productionSrv:  ProductionSrv,
                private unitsSrv:       UnitsSrv)
    {
        this.tableTrays = getTableData<any>();
        this.tableTrays.listData.disableSelection = true;
        this.listsSrv.init(this.$scope, this.tableTrays.listData);
    }

    $onInit()
    {
        this.deviceInfo = this.deviceSrv.getDeviceInfo();

        this.deviceInfo.getInputTrays().forEach((tray) => this.tableTrays.listData.array.push(tray));
        this.tableTraysColumns = this.unitsSrv.getTrayListColumns();
        this.tableTraysSortColumn = eTableTraysColumns.id;
        this.buildTableTraysHeader();
        this.updateAndSortTableTraysContents();

        this.$scope.$on(eAngularEvents.LANGUAGE_LOADED, () => this.updateAndSortTableTraysContents());
        this.$scope.$on(eAngularEvents.DEVICEINFO_CHANGED, () => this.updateAndSortTableTraysContents());

        this.$scope.$watch(() => this.unitsSrv.getLengthUnit(), () => this.updateAndSortTableTraysContents());
    }


    private buildTableTraysHeader(): void
    {
        this.tableTrays.header = [];
        this.tableTraysColumns.forEach(column =>
        {
            const def = tableTraysHeaderDefs[column];
            const header: ITableDataHeader = {
                id:        column.toString(),
                // needs to have the column id as class for the autoresize to work.
                className: column.toString(),
                text:      def.l10n,
                width:     def.width,
                resizable: true
            };
            if (def.className)
                header.className += ' ' + def.className;
            this.tableTrays.header.push(header);
        });
    }

    private calcTextColorColumn(tray: Tray): string
    {
        if (tray.isPITray() || tray.isPBTray())
            return '';
        return tray.getPaperColor().getValue() != eMediaColor.Custom
            ? tray.getPaperColor().getLocalizedValue()
            : tray.getPaperColorCustom().getLocalizedValue();
    }

    private calcTooltipPrepunchedColumn(tray: Tray): string
    {
        return tray.isPITray() || tray.isPBTray() || !tray.getPrePunched().getValue()
            ? ''
            : this.localizeFilter(keys.L10N_ACTIVITYBAR_TT_PREPUNCH);
    }

    private calcTraysHeaderClasses(): void
    {
        angular.forEach(this.tableTrays.classes, (_item, key) => delete this.tableTrays.classes[key]);
        let sortClass = eClasses.SORTED;
        if (this.tableTraysSortReversed)
            sortClass += ' ' + eClasses.REVERSE;
        this.tableTrays.classes[this.tableTraysSortColumn] = sortClass;
    }

    private getBoxIconSrc(box: Box): string
    {
        const boxStatus = this.getBoxStatus(box);
        switch (box.getBoxId().getValue())
        {
            case eBoxId.pBTrimScraps:
            // goes through
            case eBoxId.saddleStitcherTrimScraps:
                if (boxStatus == eConsumableStatus.error)
                    return eSvgIcon.TRIMSCRAPS_ERROR;
                else if (boxStatus == eConsumableStatus.warning)
                    return eSvgIcon.TRIMSCRAPS_WARNING;
                else
                    return eSvgIcon.TRIMSCRAPS;

            case eBoxId.punchHoleScraps:
                if (boxStatus == eConsumableStatus.error)
                    return eSvgIcon.PUNCHHOLESCRAPS_ERROR;
                else if (boxStatus == eConsumableStatus.warning)
                    return eSvgIcon.PUNCHHOLESCRAPS_WARNING;
                else
                    return eSvgIcon.PUNCHHOLESCRAPS;

            case eBoxId.slitter:
                if (boxStatus == eConsumableStatus.error)
                    return eSvgIcon.SLITTER_ERROR;
                else if (boxStatus == eConsumableStatus.warning)
                    return eSvgIcon.SLITTER_WARNING;
                else
                    return eSvgIcon.SLITTER;

            case eBoxId.stapleScraps:
                if (boxStatus == eConsumableStatus.error)
                    return eSvgIcon.STAPLESCRAPS_ERROR;
                else if (boxStatus == eConsumableStatus.warning)
                    return eSvgIcon.STAPLESCRAPS_WARNING;
                else
                    return eSvgIcon.STAPLESCRAPS;

            case eBoxId.wasteToner:
                if (boxStatus == eConsumableStatus.error)
                    return eSvgIcon.WASTETONER_ERROR;
                else if (boxStatus == eConsumableStatus.warning)
                    return eSvgIcon.WASTETONER_WARNING;
                else
                    return eSvgIcon.WASTETONER;
        }
    }

    private getBoxStatus(box: Box): eConsumableStatus
    {
        if (box.getLevel() == BOXLEVEL_FULL)
            return eConsumableStatus.error;
        else if (box.getLevel() == BOXLEVEL_NEARFULL)
            return eConsumableStatus.warning;
        return eConsumableStatus.ready;
    }

    private getCartridgeIconSrc(cartridge: Cartridge): string
    {
        const cartridgeStatus = this.getCartridgeStatus(cartridge);
        switch (cartridge.getCartridgeId().getValue())
        {
            case eCartridgeId.humidifierTank:
                if (cartridgeStatus == eConsumableStatus.error)
                    return eSvgIcon.HUMIDIFIERTANK_ERROR;
                else if (cartridgeStatus == eConsumableStatus.warning)
                    return eSvgIcon.HUMIDIFIERTANK_WARNING;
                else
                    return eSvgIcon.HUMIDIFIERTANK;

            case eCartridgeId.ringBindPart:
                if (cartridgeStatus == eConsumableStatus.error)
                    return eSvgIcon.RINGBINDPART_ERROR;
                else if (cartridgeStatus == eConsumableStatus.warning)
                    return eSvgIcon.RINGBINDPART_WARNING;
                else
                    return eSvgIcon.RINGBINDPART;

            case eCartridgeId.stapleUnit:
                if (cartridgeStatus == eConsumableStatus.error)
                    return eSvgIcon.STAPLEUNIT_ERROR;
                else if (cartridgeStatus == eConsumableStatus.warning)
                    return eSvgIcon.STAPLEUNIT_WARNING;
                else
                    return eSvgIcon.STAPLEUNIT;

            case eCartridgeId.trimmerReceiver:
                if (cartridgeStatus == eConsumableStatus.error)
                    return eSvgIcon.TRIMMERRECEIVER_ERROR;
                else if (cartridgeStatus == eConsumableStatus.warning)
                    return eSvgIcon.TRIMMERRECEIVER_WARNING;
                else
                    return eSvgIcon.TRIMMERRECEIVER;

            case eCartridgeId.perfectBinderGlue:
                if (cartridgeStatus == eConsumableStatus.error)
                    return eSvgIcon.PERFECTBINDERGLUE_ERROR;
                else if (cartridgeStatus == eConsumableStatus.warning)
                    return eSvgIcon.PERFECTBINDERGLUE_WARNING;
                else
                    return eSvgIcon.PERFECTBINDERGLUE;
        }
    }

    private getCartridgeStatus(cartridge: Cartridge): eConsumableStatus
    {
        if (cartridge.getLevel() == CARTRIDGELEVEL_EMPTY)
            return eConsumableStatus.error;
        else if (cartridge.getLevel() == CARTRIDGELEVEL_NEAREMPTY)
            return eConsumableStatus.warning;
        return eConsumableStatus.ready;
    }

    private getTraysViewValueData(tray: Tray, column: eTableTraysColumns): string | number | undefined
    {
        switch (column)
        {
        case eTableTraysColumns.id:
            return tray.getTrayId().getValue();
        case eTableTraysColumns.paperSize:
            return tray.getPaperSizeTrayString();
        case eTableTraysColumns.paperAmount:
            if (tray.isAmountReliable())
                return tray.getPaperAmount();
            else
                return tray.calcAmountTooltip();
        case eTableTraysColumns.paperColor:
            return this.calcTextColorColumn(tray);
        case eTableTraysColumns.paperType:
            return tray.getPaperType().getLocalizedValue();
        case eTableTraysColumns.paperWeight:
            return tray.getPaperWeight().getValue();
        case eTableTraysColumns.paperWeightUnit:
            return tray.getPaperWeightUnit().getLocalizedValue();
        case eTableTraysColumns.paperProfile:
            return tray.getPaperProfileId().getValue() == PAPERPROFILE_NOSET
                ? ''
                : tray.getPaperProfileName().getLocalizedValue();
        case eTableTraysColumns.feedDirection:
            return tray.getFeedDirection().getLocalizedValue();
        case eTableTraysColumns.prepunched:
            return this.calcTooltipPrepunchedColumn(tray);
        case eTableTraysColumns.paperProfileId:
            return tray.getPaperProfileId().getValue();
        }
    }

    private onScrollingConsumablesMouseUp = (): void => this.$scope.$apply(() =>
    {
        this.$document.off(eEvents.MOUSEUP, this.onScrollingConsumablesMouseUp);
        this.scrollingDownConsumables = false;
        this.scrollingUpConsumables = false;
    });

    private onScrollingStatusMouseUp = (): void => this.$scope.$apply(() =>
    {
        this.$document.off(eEvents.MOUSEUP, this.onScrollingStatusMouseUp);
        this.scrollingDownStatus = false;
        this.scrollingUpStatus = false;
    });

    private sortTraysData(): void
    {
        const traysList = this.tableTrays.listData.array;

        const sorted = this.orderByFilter(traysList,
            (row) => this.getTraysViewValueData(row, this.tableTraysSortColumn),
            this.tableTraysSortReversed);
        traysList.length = 0;
        angular.extend(traysList, sorted);

        this.calcTraysHeaderClasses();
    }

    private updateAndSortTableTraysContents(): void
    {
        this.sortTraysData();
        this.updateTableTraysContents();
    }

    private updateTableTraysContents(): void
    {
        this.tableTrays.body.length = 0;
        // loop rows
        this.tableTrays.listData.array.forEach((tray, rowIdx) =>
        {
            const tableRow: ITableRow = {
                id:          tray.getTrayId().getValue() as number,
                shTableCols: []
            };
            // loop columns for each row
            this.tableTraysColumns.forEach((_column, columnIdx) =>
            {
                const header = this.tableTrays.header[columnIdx];
                const td: ITableDataCell = {
                    id:        header.id,
                    className: header.className
                };
                switch (+header.id)
                {
                case eTableTraysColumns.id:
                    td.text = tray.getTrayId().getLocalizedValue();
                    break;
                case eTableTraysColumns.paperSize:
                    td.text = tray.getPaperSizeTrayString();
                    break;
                case eTableTraysColumns.paperAmount:
                    td.dynamic = `<sh-svg-paper-amount-icon tray="shTable.listData.array[${rowIdx}]"></sh-svg-paper-amount-icon>`;
                    break;
                case eTableTraysColumns.paperColor:
                    td.text = this.calcTextColorColumn(tray);
                    if (tray.getPaperColor().getValue() == eMediaColor.Custom)
                        td.className += ' ' + eClasses.ITALIC;
                    break;
                case eTableTraysColumns.paperType:
                    td.text = tray.getPaperType().getLocalizedValue();
                    break;
                case eTableTraysColumns.paperWeight:
                    td.text = tray.getPaperWeight().getLocalizedValue(tray.getPaperWeightUnit().getValue());
                    break;
                case eTableTraysColumns.paperWeightUnit:
                    td.text = tray.getPaperWeightUnit().getLocalizedValue();
                    break;
                case eTableTraysColumns.paperProfile:
                    td.text = tray.getPaperProfileId().getValue() == PAPERPROFILE_NOSET
                        ? ''
                        : tray.getPaperProfileName().getLocalizedValue();
                    break;
                case eTableTraysColumns.feedDirection:
                    td.text = tray.getFeedDirection().getLocalizedValue();
                    break;
                case eTableTraysColumns.prepunched:
                    td.tooltip = this.calcTooltipPrepunchedColumn(tray);
                    if (!tray.isPITray() && !tray.isPBTray() && tray.getPrePunched().getValue())
                        td.className += ' icon-on';
                    break;
                case eTableTraysColumns.paperProfileId:
                    td.text = tray.getPaperProfileId().getValue() == PAPERPROFILE_NOSET
                        ? ''
                        : tray.getPaperProfileId().getValue().toString();
                    break;
                }
                tableRow.shTableCols.push(td);
            });
            this.tableTrays.body.push(tableRow);
        });
    }

    private updateConsumableRows(): void
    {
        let boxIdx:       number = 0;
        let cartridgeIdx: number = 0;

        for (let i = 0; i < this.consumableRows.length; i++)
        {
            if (this.deviceSrv.getSortedBoxes().length > boxIdx)
            {
                this.consumableRows[i][0] = this.deviceSrv.getSortedBoxes()[boxIdx];
                boxIdx++;
                if (this.deviceSrv.getSortedBoxes().length > boxIdx)
                {
                    this.consumableRows[i][1] = this.deviceSrv.getSortedBoxes()[boxIdx];
                    boxIdx++;
                }
                else if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
                {
                    this.consumableRows[i][1] = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                    cartridgeIdx++;
                }
            }
            else if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
            {
                this.consumableRows[i][0] = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                cartridgeIdx++;
                if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
                {
                    this.consumableRows[i][1] = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                    cartridgeIdx++;
                }
            }
            // there are still rows but we have already finished our boxes/cartridges
            else
                for (let j = this.consumableRows.length - 1; j >= i; j--)
                    this.consumableRows.splice(j, 1);
        }
        // add the not yet displayed box / cartridges in new rows!
        while (this.deviceSrv.getSortedBoxes().length > boxIdx || this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
        {
            let leftConsumable: Box | Cartridge | undefined;
            let rightConsumable: Box | Cartridge | undefined;

            if (this.deviceSrv.getSortedBoxes().length > boxIdx)
            {
                leftConsumable = this.deviceSrv.getSortedBoxes()[boxIdx];
                boxIdx++;
                if (this.deviceSrv.getSortedBoxes().length > boxIdx)
                {
                    rightConsumable = this.deviceSrv.getSortedBoxes()[boxIdx];
                    boxIdx++;
                }
                else if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
                {
                    rightConsumable = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                    cartridgeIdx++;
                }
            }
            else if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
            {
                leftConsumable = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                cartridgeIdx++;
                if (this.deviceSrv.getSortedCartridges().length > cartridgeIdx)
                {
                    rightConsumable = this.deviceSrv.getSortedCartridges()[cartridgeIdx];
                    cartridgeIdx++;
                }
            }

            if (leftConsumable != undefined)
                this.consumableRows.push([leftConsumable, rightConsumable]);
        }
    }

    public getCancelTooltipLabel(): string
    {
        return this.localizeFilter(keys.L10N_ACTIVITYBAR_TT_CANCELBUTTON);
    }

    public getConsumableIconSrc(consumable: Box | Cartridge | undefined): string
    {
        if (consumable instanceof Box)
            return this.getBoxIconSrc(consumable);
        if (consumable instanceof Cartridge)
            return this.getCartridgeIconSrc(consumable);

        return '';
    }

    public getConsumableLabelClass(consumable: Box | Cartridge | undefined): string
    {
        let consumableStatus = eConsumableStatus.ready;
        if (consumable instanceof Box)
            consumableStatus = this.getBoxStatus(consumable);
        else if (consumable instanceof Cartridge)
            consumableStatus = this.getCartridgeStatus(consumable);

        switch (consumableStatus)
        {
        case eConsumableStatus.error:
            return eClasses.ERROR;
        case eConsumableStatus.warning:
            return eClasses.WARNING;
        case eConsumableStatus.ready:
            return '';
        }
    }

    public getConsumableRows():  [ Box | Cartridge, Box | Cartridge | undefined ][]
    {
        this.updateConsumableRows();
        return this.consumableRows;
    }

    public getConsumablesScrollTitle(): string
    {
        return this.localizeFilter(keys.L10N_ACTIVITYBAR_SCROLLTITLE_CONSUMABLES);
    }

    public getConsumableWarnignErrorIconSrc(consumable: Box | Cartridge | undefined): string
    {
        let consumableStatus = eConsumableStatus.ready;
        if (consumable instanceof Box)
            consumableStatus = this.getBoxStatus(consumable);
        else if (consumable instanceof Cartridge)
            consumableStatus = this.getCartridgeStatus(consumable);

        if (consumableStatus == eConsumableStatus.error)
            return eSvgIcon.STATUS_ERROR;
        else if (consumableStatus == eConsumableStatus.warning)
            return eSvgIcon.STATUS_WARNING;
        else
            return '';
    }

    public getCopiesOnProductionText(): string
    {
        if (this.productionSrv.getPrintedCopies() == undefined)
            return this.localizeFilter(keys.L10N_ACTIVITYBAR_NOCOPIES);

        return this.productionSrv.getPrintedCopies() + '/' + this.productionSrv.getTotalCopies();
    }

    public getEnvelopeOnlyMsg(): string
    {
        return this.localizeFilter(keys.L10N_ACTIVITYBAR_DEVICEINFO_ENVELOPEONLY);
    }

    public getJobTitle(): string
    {
        if (this.productionSrv.getJobId() == undefined)
            return this.localizeFilter(keys.L10N_ACTIVITYBAR_NOJOB);

        return this.localizeFilter(keys.L10N_ACTIVITYBAR_JOBTITLE,
            '' + this.productionSrv.getJobId(),
            this.productionSrv.getJobName() || '');
    }

    public getBackGroundColorClass(): string
    {
        return this.deviceSrv.getPrinterStatusOrderByPriority().length % 2 == 1 ? '' : eClasses.ODD ;
    }

    public getLeadingStatusIconSrc(): string
    {
        const statusOrderByPriority = this.deviceSrv.getPrinterStatusOrderByPriority();

        const errorStatus = statusOrderByPriority.find(status => status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.error);
        if (errorStatus)
            return eSvgIcon.STATUS_ERROR;
        const warningStatus = statusOrderByPriority.find(status =>
                status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning
             && status.getMainPrinterStatus().getValue() != eMainPrinterStatus.warmingUp
             && status.getMainPrinterStatus().getValue() != eMainPrinterStatus.lowPowerMode
             && status.getMainPrinterStatus().getValue() != eMainPrinterStatus.sleep
             && status.getMainPrinterStatus().getValue() != eMainPrinterStatus.calibrating
             && status.getMainPrinterStatus().getValue() != eMainPrinterStatus.subPowerSupplyOff);
        if (warningStatus)
            return eSvgIcon.STATUS_WARNING;

        return '';
    }

    public getLeadingStatusText(): string
    {
        // check whether there is an error status
        const errorStatus: PrinterStatus | undefined = this.deviceSrv.getPrinterStatusOrderByPriority().find(
            status => status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.error);
        if (errorStatus)
            return errorStatus.getMainPrinterStatus().getLocalizedValue();

        // check whether there is a job on production
        if (this.productionSrv.getJobId() != undefined)
        {
            const status = this.productionSrv.getProductionStatus();
            switch (status)
            {
                case eJobStatus.printing:
                // goes through
                case eJobStatus.waitPrinting:
                // goes through
                case eJobStatus.ripping:
                // goes through
                case eJobStatus.waitRipping:
                // goes through
                case eJobStatus.receiving:
                // goes through
                case eJobStatus.sendingToEngine:
                // goes through
                case eJobStatus.stopPrinting:
                // goes through
                case eJobStatus.warningStopPrint:
                // goes through
                case eJobStatus.canceling:
                // goes through
                case eJobStatus.holdJobFull:
                // goes through
                case eJobStatus.error:
                    return this.localizeFilter(jobStatusMap.getKey(status));

                default:
                    break;
            }
        }

        // check whether there is a status which does not allow printing
        const noPrintPossibleStatus: PrinterStatus | undefined = this.deviceSrv.getPrinterStatusOrderByPriority().find(
            status => status.getMainPrinterStatus().getValue() == eMainPrinterStatus.lowPowerMode
                || status.getMainPrinterStatus().getValue() == eMainPrinterStatus.sleep
                || status.getMainPrinterStatus().getValue() == eMainPrinterStatus.warmingUp
                || status.getMainPrinterStatus().getValue() == eMainPrinterStatus.calibrating
                || status.getMainPrinterStatus().getValue() == eMainPrinterStatus.operationWarning);
        if (noPrintPossibleStatus)
            return noPrintPossibleStatus.getMainPrinterStatus().getLocalizedValue();

        // check whether there is a status (no error && no warning) to display
        const noErrorStatus: PrinterStatus | undefined = this.deviceSrv.getPrinterStatusOrderByPriority().find(
            status => status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.noError);
        return noErrorStatus ? noErrorStatus.getMainPrinterStatus().getLocalizedValue()
                             : this.localizeFilter(keys.L10N_ACTIVITYBAR_IDLE)
    }

    public getLocalizedConsumableId(consumable: Box | Cartridge | undefined): string
    {
        if (consumable instanceof Box)
            return consumable.getBoxId().getLocalizedValue();
        if (consumable instanceof Cartridge)
            return consumable.getCartridgeId().getLocalizedValue();

        return '';
    }

    public getLocalizedConsumableLevel(consumable: Box | Cartridge | undefined): string
    {
        if (consumable instanceof Cartridge)
        {
            const cartridgeStatus = this.getCartridgeStatus(consumable);
            switch (cartridgeStatus)
            {
            case eConsumableStatus.error:
                return this.localizeFilter(keys.L10N_CARTRIDGESLEVEL_EMPTY);
            case eConsumableStatus.warning:
                return this.localizeFilter(keys.L10N_CARTRIDGESLEVEL_NEAREMPTY);
            case eConsumableStatus.ready:
                return this.localizeFilter(keys.L10N_CARTRIDGESLEVEL_READY);
            }
        }

        if (consumable instanceof Box)
        {
            const boxStatus = this.getBoxStatus(consumable);
            switch (boxStatus)
            {
            case eConsumableStatus.ready:
                return this.localizeFilter(keys.L10N_BOXLEVEL_READY);
            case eConsumableStatus.error:
                return this.localizeFilter(keys.L10N_BOXLEVEL_FULL);
            case eConsumableStatus.warning:
                return this.localizeFilter(keys.L10N_BOXLEVEL_NEARFULL);
            }
        }

        return '';
    }

    public getNoErrorsLabel(): string
    {
        return this.localizeFilter(keys.L10N_ACTIVITYBAR_NOERRORS);
    }

    public getPagesOnProductionText(): string
    {
        const printed = this.productionSrv.getPrintedPages();
        const total = this.productionSrv.getTotalPages();

        if (printed == undefined)
            return this.localizeFilter(keys.L10N_ACTIVITYBAR_NOPAGES);

        let str = printed.toString();
        if (total != undefined)
            str += '/' + total;

        return str;
    }

    public getPercentage(): number | undefined
    {
        const printedCopies = this.productionSrv.getPrintedCopies();
        const printedPages  = this.productionSrv.getPrintedPages();
        const totalCopies   = this.productionSrv.getTotalCopies();
        const totalPages    = this.productionSrv.getTotalPages() as number | undefined;

        if (printedCopies == 0
        || printedCopies == undefined
        || printedPages == undefined
        || totalPages == undefined
        || totalCopies == undefined)
            return undefined;

        const local = printedPages / totalPages;
        return (printedCopies + local) / totalCopies;
    }

    public getPercentageText(): string
    {
        const value = this.getPercentage();
        if (value == undefined)
            return '';

        return getLangSensitiveFormattedNumber(value * 100, 1) + '%';
    }

    public getPrinterStatus(): PrinterStatus[]
    {
        return this.deviceInfo.getPrinterStatus();
    }

    public getPrinterStatusLevelSrc(status: PrinterStatus): string
    {
        switch (status.getLevelPrinterStatus().getValue())
        {
            case eLevelPrinterStatus.error:
                return eSvgIcon.STATUS_ERROR;
            case eLevelPrinterStatus.warning:
                return eSvgIcon.STATUS_WARNING;
            case eLevelPrinterStatus.noError:
            // goes through
            default:
                return '';
        }
    }

    public getStatusInfoSvgIconClasses(): string
    {
        return this.deviceSrv.getPrinterStatusOrderByPriority().some(status =>
            {
                if (status.getLevelPrinterStatus().getValue() != eLevelPrinterStatus.error) return false;
                return true;
            }) ? eClasses.JUMP : '';
    }

    public getStatusScrollTitle(): string
    {
        return this.localizeFilter(keys.L10N_ACTIVITYBAR_SCROLLTITLE_STATUS);
    }

    public getTraysRowClass(row: ITableRow): ({ [property: string]: boolean })
    {
        const classesObj: { [property: string]: boolean } = {};
        this.debugSrv.assert(this.deviceInfo.getInputTrays().some((tray) =>
        {
            if (tray.getTrayId().getValue() != +row.id) return false;

            classesObj[eClasses.ERROR] = this.deviceSrv.isPaperAmountTrayError(tray);
            classesObj[eClasses.WARNING] = this.deviceSrv.isPaperAmountTrayWarning(tray);
            return true;
        }), 'Tray not found!');

        return classesObj;
    }

    public getError(): string
    {
        const status = this.productionSrv.getProductionStatus();
        return status == eJobStatus.warningStopPrint
            || status == eJobStatus.holdJobFull
            || status == eJobStatus.destinationQueueFull
            ? eClasses.ERROR
            : '';
    }

    public getSortedInks(): Ink[]
    {
        return this.deviceSrv.getSortedInks();
    }

    public isConsumableWithWarningError(consumable: Box | Cartridge | undefined): boolean
    {
        let consumableStatus = eConsumableStatus.ready;
        if (consumable instanceof Box)
            consumableStatus = this.getBoxStatus(consumable);
        else if (consumable instanceof Cartridge)
            consumableStatus = this.getCartridgeStatus(consumable);

        return consumableStatus == eConsumableStatus.error
            || consumableStatus == eConsumableStatus.warning;
    }

    public isEnvelopeOnly(): boolean
    {
        return this.deviceSrv.getEnvelopeFusing() == eEnvelopeFusingUnit.EF_103;
    }

    public isExtendedView(): boolean
    {
        return this.barStatus == eBottomZoneStatus.medium
            || this.barStatus == eBottomZoneStatus.full;
    }

    public isFirstCopy(): boolean
    {
        return this.productionSrv.getPrintedCopies() == 0;
    }

    public isFullView(): boolean
    {
        return this.barStatus == eBottomZoneStatus.full;
    }

    public isMediumView(): boolean
    {
        return this.barStatus == eBottomZoneStatus.medium;
    }

    public isJobOnProduction(): boolean
    {
        return this.productionSrv.getJobId() != undefined;
    }

    public isNoErrorsLabelVisible(): boolean
    {
        return !this.deviceSrv.getPrinterStatusOrderByPriority().length;
    }

    public isScrollingDownConsumablesEnabled(): boolean
    {
        return this.scrollingDownConsumablesEnabled;
    }

    public isScrollingDownConsumablesPressed(): boolean
    {
        return this.scrollingDownConsumables;
    }

    public isScrollingDownStatusEnabled(): boolean
    {
        return this.scrollingDownStatusEnabled;
    }

    public isScrollingDownStatusPressed(): boolean
    {
        return this.scrollingDownStatus;
    }

    public isScrollingUpConsumablesEnabled(): boolean
    {
        return this.scrollingUpConsumablesEnabled;
    }

    public isScrollingUpConsumablesPressed(): boolean
    {
        return this.scrollingUpConsumables;
    }

    public isScrollingUpStatusEnabled(): boolean
    {
        return this.scrollingUpStatusEnabled;
    }

    public isScrollingUpStatusPressed(): boolean
    {
        return this.scrollingUpStatus;
    }

    public isStatusInfoButtonEnabled(): boolean
    {
        return this.deviceSrv.getPrinterStatusOrderByPriority().some(status =>
            {
                if (status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.error
                    || status.getLevelPrinterStatus().getValue() == eLevelPrinterStatus.warning)
                    return true;
                else return false;
            });
    }

    public onCancelClick(): void
    {
        const jobId = this.productionSrv.getJobId();
        if (jobId == undefined)
            return;

        const job = this.jobSrv.getActiveJob(jobId) as Job;
        if (this.debugSrv.assert(job != undefined, `Active job not found for job id ${jobId}`))
            this.jobSrv.confirmCancelJobs([job]);
    }

    public onScrollDownConsumables(): void
    {
        if (this.scrollingDownConsumables)
            return;

        this.$document.on(eEvents.MOUSEUP, this.onScrollingConsumablesMouseUp);
        this.scrollingDownConsumables = true;
    }

    public onScrollDownStatus(): void
    {
        if (this.scrollingDownStatus)
            return;

        this.$document.on(eEvents.MOUSEUP, this.onScrollingStatusMouseUp);
        this.scrollingDownStatus = true;
    }

    public onScrollUpConsumables(): void
    {
        if (this.scrollingUpConsumables)
            return;

        this.$document.on(eEvents.MOUSEUP, this.onScrollingConsumablesMouseUp);
        this.scrollingUpConsumables = true;
    }

    public onScrollUpStatus(): void
    {
        if (this.scrollingUpStatus)
            return;

        this.$document.on(eEvents.MOUSEUP, this.onScrollingStatusMouseUp);
        this.scrollingUpStatus = true;
    }

    public onStatusInfoClick(): void
    {
        this.onStatusBtnClick();
    }

    public onTableTraysHeaderClick(id: string, ev: JQueryEventObject): void
    {
        const columnId = +id;
        ev.stopPropagation();

        if (this.tableTraysSortColumn == columnId)
        {
            this.tableTraysSortReversed = !this.tableTraysSortReversed;
        }
        else
        {
            this.tableTraysSortColumn = columnId;
            this.tableTraysSortReversed = false;
        }

        this.buildTableTraysHeader();
        this.updateAndSortTableTraysContents();
    }

    public onTableTraysHeaderOrderChange(list: string[])
    {
        this.tableTraysColumns = list.map(item => +item);

        this.unitsSrv.setUnits({ trayListColumns: this.tableTraysColumns });

        this.buildTableTraysHeader();
        this.updateAndSortTableTraysContents();
    }

    public updateConsumablesScrollButtons(position: eScrollPosition): void
    {
        switch (position)
        {
            case eScrollPosition.top:
                this.scrollingDownConsumablesEnabled = true;
                this.scrollingUpConsumablesEnabled = false;
                break;
            case eScrollPosition.bottom:
                this.scrollingUpConsumablesEnabled = true;
                this.scrollingDownConsumablesEnabled = false;
                break;
            case eScrollPosition.middle:
                this.scrollingUpConsumablesEnabled = true;
                this.scrollingDownConsumablesEnabled = true;
                break;
            default:
                break;
        }
    }

    public updateStatusScrollButtons(position: eScrollPosition): void
    {
        switch (position)
        {
            case eScrollPosition.top:
                this.scrollingDownStatusEnabled = true;
                this.scrollingUpStatusEnabled = false;
                break;
            case eScrollPosition.bottom:
                this.scrollingUpStatusEnabled = true;
                this.scrollingDownStatusEnabled = false;
                break;
            case eScrollPosition.middle:
                this.scrollingUpStatusEnabled = true;
                this.scrollingDownStatusEnabled = true;
                break;
            default:
                break;
        }
    }
}

export class ShActivityBar implements ng.IComponentOptions
{
    bindings   = {
        barStatus:        '<',
        onStatusBtnClick: '&'
    };
    controller = ShActivityBarCtrl;
    template   = require('./shActivityBar.html');
    css        = require('./shActivityBar.css');
}
