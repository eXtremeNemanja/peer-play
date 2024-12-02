import React from "react";
import './SelectField.css';

interface Props {
    value : any,
    onChange : any,
    label : string,
    id : string,
    items : any[]
}

const SelectField = ({value, onChange, label, id, items} : Props) => {
    return (
        <div className="select-field">
            <label className="select-label" htmlFor={id}>{label}</label>
            <select
                id={id}
                value={value}
                onChange={onChange}
                className="select"
                >
                {items.map((item, index) => (
                    <option key={index} value={item}>
                        {item}
                    </option>
                ))}
                </select>
        </div>
    );
};

export default SelectField;